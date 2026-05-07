import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import PDFDocument from "pdfkit";
import {Document, Packer, Paragraph, TextRun, HeadingLevel} from "docx";

// Initialize admin if not already done.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

/**
 * Formats seconds into [MM:SS] timestamp string.
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Formats seconds into a human-readable duration string.
 */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0 minutes";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Formats a Firestore Timestamp into a readable date string.
 */
function formatDate(timestamp: admin.firestore.Timestamp): string {
  const date = timestamp.toDate();
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  return date.toLocaleDateString("en-US", options);
}

interface SegmentData {
  speakerIndex: number;
  originalText: string;
  startTime: number;
}

interface TranscriptLine {
  timestamp: string;
  speakerName: string;
  text: string;
}

/**
 * Builds transcript lines from segment documents and session data.
 */
function buildTranscriptLines(
  segments: SegmentData[],
  speakerNames: Record<string, string>
): TranscriptLine[] {
  return segments.map((seg) => {
    const speakerIndex = seg.speakerIndex ?? 0;
    const speakerName =
      speakerNames[String(speakerIndex)] ||
      `Speaker ${speakerIndex + 1}`;
    const timestamp = formatTimestamp(seg.startTime ?? 0);
    return {
      timestamp,
      speakerName,
      text: seg.originalText || "",
    };
  });
}

/**
 * Generates a plain text transcript.
 */
function generateTxt(
  title: string,
  dateStr: string,
  durationStr: string,
  speakerCount: number,
  lines: TranscriptLine[]
): Buffer {
  let output = "Sheen Meeting Transcript\n";
  output += "========================\n";
  output += `Title: ${title}\n`;
  output += `Date: ${dateStr}\n`;
  output += `Duration: ${durationStr}\n`;
  output += `Speakers: ${speakerCount}\n`;
  output += "\n---\n\n";

  for (const line of lines) {
    output += `[${line.timestamp}] ${line.speakerName}: ${line.text}\n`;
  }

  return Buffer.from(output, "utf-8");
}

/**
 * Generates a PDF transcript using pdfkit.
 */
function generatePdf(
  title: string,
  dateStr: string,
  durationStr: string,
  speakerCount: number,
  lines: TranscriptLine[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({margin: 50});
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Title
    doc.fontSize(20).font("Helvetica-Bold").text("Sheen Meeting Transcript");
    doc.moveDown(0.5);

    // Metadata
    doc.fontSize(11).font("Helvetica");
    doc.text(`Title: ${title}`);
    doc.text(`Date: ${dateStr}`);
    doc.text(`Duration: ${durationStr}`);
    doc.text(`Speakers: ${speakerCount}`);
    doc.moveDown(0.5);

    // Separator
    doc
      .strokeColor("#cccccc")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .stroke();
    doc.moveDown(0.5);

    // Transcript lines
    doc.fontSize(10).font("Helvetica");
    for (const line of lines) {
      doc
        .font("Helvetica-Bold")
        .text(`[${line.timestamp}] ${line.speakerName}: `, {continued: true})
        .font("Helvetica")
        .text(line.text);
      doc.moveDown(0.3);
    }

    doc.end();
  });
}

/**
 * Generates a DOCX transcript using the docx package.
 */
async function generateDocx(
  title: string,
  dateStr: string,
  durationStr: string,
  speakerCount: number,
  lines: TranscriptLine[]
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Sheen Meeting Transcript",
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({text: `Title: ${title}`, size: 22}),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({text: `Date: ${dateStr}`, size: 22}),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({text: `Duration: ${durationStr}`, size: 22}),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({text: `Speakers: ${speakerCount}`, size: 22}),
            ],
          }),
          new Paragraph({text: ""}),
          // Transcript lines
          ...lines.map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[${line.timestamp}] ${line.speakerName}: `,
                    bold: true,
                    size: 20,
                  }),
                  new TextRun({
                    text: line.text,
                    size: 20,
                  }),
                ],
              })
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

/**
 * Callable Cloud Function: exportTranscript
 *
 * Receives sessionId and format, generates the export file,
 * uploads to Cloud Storage, and returns the download URL.
 */
export const exportTranscript = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
    timeoutSeconds: 120,
  },
  async (request) => {
    // 1. Authenticate
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be signed in.");
    }

    // 2. Validate input
    const {sessionId, format} = request.data;
    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }
    if (!format || !["pdf", "docx", "txt"].includes(format)) {
      throw new HttpsError(
        "invalid-argument",
        "format must be 'pdf', 'docx', or 'txt'."
      );
    }

    // 3. Load session
    const sessionDoc = await db.collection("sessions").doc(sessionId).get();
    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }
    const sessionData = sessionDoc.data() || {};

    // 4. Verify ownership
    if (sessionData.userId !== uid) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this session."
      );
    }

    // 5. Load segments
    const segmentsSnap = await db
      .collection("sessions")
      .doc(sessionId)
      .collection("segments")
      .orderBy("order")
      .get();

    const segments: SegmentData[] = segmentsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        speakerIndex: (d.speakerIndex as number) ?? 0,
        originalText: (d.originalText as string) ?? "",
        startTime: (d.startTime as number) ?? 0,
      };
    });

    // 6. Build metadata
    const title = (sessionData.title as string) || "Untitled Session";
    const duration = (sessionData.duration as number) || 0;
    const speakerCount = (sessionData.speakerCount as number) || 0;
    const speakerNames = (sessionData.speakerNames as Record<string, string>) || {};

    const createdAt = sessionData.createdAt as admin.firestore.Timestamp;
    const dateStr = createdAt ? formatDate(createdAt) : "Unknown date";
    const durationStr = formatDuration(duration);

    // 7. Build transcript lines
    const lines = buildTranscriptLines(segments, speakerNames);

    // 8. Generate file
    let fileBuffer: Buffer;
    let contentType: string;

    switch (format) {
    case "txt":
      fileBuffer = generateTxt(title, dateStr, durationStr, speakerCount, lines);
      contentType = "text/plain";
      break;
    case "pdf":
      fileBuffer = await generatePdf(
        title, dateStr, durationStr, speakerCount, lines
      );
      contentType = "application/pdf";
      break;
    case "docx":
      fileBuffer = await generateDocx(
        title, dateStr, durationStr, speakerCount, lines
      );
      contentType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      break;
    default:
      throw new HttpsError("invalid-argument", "Unsupported format.");
    }

    // 9. Upload to Cloud Storage
    const bucket = storage.bucket();
    const filePath = `exports/${uid}/${sessionId}.${format}`;
    const file = bucket.file(filePath);

    await file.save(fileBuffer, {
      metadata: {contentType},
    });

    // Generate a signed URL valid for 1 hour
    const [downloadUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });

    return {downloadUrl};
  }
);
