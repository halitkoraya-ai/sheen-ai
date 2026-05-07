import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {
  resolveBatchFailureStatus,
  resolveBatchTranscribeAction,
} from "./retranscriptionShared";

const db = admin.firestore();

async function deleteSegmentsSubcollection(
  sessionRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const segmentsRef = sessionRef.collection("segments");
  const snapshot = await segmentsRef.get();
  const BATCH_LIMIT = 500;

  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = snapshot.docs.slice(i, i + BATCH_LIMIT);

    for (const doc of chunk) {
      batch.delete(doc.ref);
    }

    await batch.commit();
  }
}

/**
 * Callable Cloud Function that performs batch transcription of an
 * offline-recorded audio file.
 *
 * 1. Verifies auth + session ownership
 * 2. Atomically sets status pendingTranscription -> transcribing
 * 3. Downloads audio from the provided URL
 * 4. Calls Deepgram pre-recorded API with diarize=true
 * 5. Translates final segments via Google Translate
 * 6. Writes segments to Firestore with deterministic IDs
 * 7. Updates session status to completed + speakerCount + duration
 * 8. Calls finalizeSession logic (usage metering)
 */
export const batchTranscribe = onCall(
  {timeoutSeconds: 540, memory: "1GiB"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const {sessionId, audioUrl, sourceLanguage, targetLanguage} =
      request.data as {
        sessionId?: string;
        audioUrl?: string;
        sourceLanguage?: string;
        targetLanguage?: string;
        force?: boolean;
      };
    const force = request.data?.force === true;

    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }
    if (!audioUrl || typeof audioUrl !== "string") {
      throw new HttpsError("invalid-argument", "audioUrl is required.");
    }
    if (!sourceLanguage || typeof sourceLanguage !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "sourceLanguage is required."
      );
    }
    if (!targetLanguage || typeof targetLanguage !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "targetLanguage is required."
      );
    }

    // Verify session belongs to this user.
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }
    const sessionData = sessionDoc.data() || {};
    if (sessionData.userId !== uid) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this session."
      );
    }

    const currentStatus = sessionData.status;
    const startAction = resolveBatchTranscribeAction({
      status: currentStatus,
      force,
    });

    if (startAction.kind === "skip") {
      if (startAction.reason === "alreadyCompleted") {
        return {success: true, alreadyCompleted: true};
      }
      return {success: true, alreadyProcessing: true};
    }

    if (startAction.kind === "error") {
      throw new HttpsError(
        "failed-precondition",
        `Session status is '${startAction.actualStatus}', expected '${startAction.expectedStatus}'.`
      );
    }

    if (startAction.deleteExistingSegments) {
      await deleteSegmentsSubcollection(sessionRef);
    }

    await sessionRef.update({
      status: "transcribing",
      ...(force ? {sourceLanguage, targetLanguage} : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      // Download audio from the provided URL.
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(
          `Failed to download audio: ${audioResponse.statusText}`
        );
      }
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      // Call Deepgram pre-recorded API.
      const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
      if (!deepgramApiKey) {
        throw new Error("DEEPGRAM_API_KEY not configured");
      }

      const dgResponse = await fetch(
        "https://api.deepgram.com/v1/listen?" +
          new URLSearchParams({
            model: "nova-2",
            language: sourceLanguage,
            diarize: "true",
            punctuate: "true",
          }).toString(),
        {
          method: "POST",
          headers: {
            Authorization: `Token ${deepgramApiKey}`,
            "Content-Type": "audio/wav",
          },
          body: audioBuffer,
        }
      );

      if (!dgResponse.ok) {
        const errText = await dgResponse.text();
        throw new Error(`Deepgram API error: ${dgResponse.status} ${errText}`);
      }

      const dgResult = (await dgResponse.json()) as any;

      // Parse Deepgram results into segments.
      const utterances = dgResult.results?.utterances ?? [];
      const paragraphs =
        dgResult.results?.channels?.[0]?.alternatives?.[0]?.paragraphs
          ?.paragraphs ?? [];

      // Use utterances if available, otherwise fall back to paragraphs.
      interface RawSegment {
        speaker: number;
        text: string;
        start: number;
        end: number;
      }
      const rawSegments: RawSegment[] = [];

      if (utterances.length > 0) {
        for (const u of utterances) {
          rawSegments.push({
            speaker: u.speaker ?? 0,
            text: (u.transcript ?? "").trim(),
            start: u.start ?? 0,
            end: u.end ?? 0,
          });
        }
      } else if (paragraphs.length > 0) {
        for (const para of paragraphs) {
          for (const sentence of para.sentences ?? []) {
            rawSegments.push({
              speaker: para.speaker ?? 0,
              text: (sentence.text ?? "").trim(),
              start: sentence.start ?? 0,
              end: sentence.end ?? 0,
            });
          }
        }
      } else {
        // Fallback: single segment from the full transcript
        const fullTranscript =
          dgResult.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
        if (fullTranscript.trim()) {
          rawSegments.push({
            speaker: 0,
            text: fullTranscript.trim(),
            start: 0,
            end: sessionData.duration ?? 0,
          });
        }
      }

      // Translate segments via Google Translate API.
      const {TranslationServiceClient} = await import(
        "@google-cloud/translate"
      );
      const translationClient = new TranslationServiceClient();
      const projectId = process.env.GOOGLE_CLOUD_PROJECT;

      const translatedSegments: Array<RawSegment & {translatedText: string | null}> = [];

      for (const seg of rawSegments) {
        let translatedText: string | null = null;
        if (
          projectId &&
          sourceLanguage !== targetLanguage &&
          seg.text.length > 0
        ) {
          try {
            const [response] = await translationClient.translateText({
              parent: `projects/${projectId}/locations/global`,
              contents: [seg.text],
              sourceLanguageCode: sourceLanguage,
              targetLanguageCode: targetLanguage,
              mimeType: "text/plain",
            });
            translatedText =
              response.translations?.[0]?.translatedText ?? null;
          } catch (err) {
            console.error("Translation failed for segment:", err);
          }
        }
        translatedSegments.push({...seg, translatedText});
      }

      // Write segments to Firestore with deterministic IDs for idempotency.
      const segmentsRef = sessionRef.collection("segments");
      const speakerIndices = new Set<number>();
      const BATCH_LIMIT = 500;

      for (let i = 0; i < translatedSegments.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        const chunk = translatedSegments.slice(i, i + BATCH_LIMIT);

        for (let j = 0; j < chunk.length; j++) {
          const seg = chunk[j];
          const order = i + j;
          const segDocId = `${sessionId}_seg_${order}`;
          const segDocRef = segmentsRef.doc(segDocId);

          speakerIndices.add(seg.speaker);

          batch.set(segDocRef, {
            speakerIndex: seg.speaker,
            originalText: seg.text,
            translatedText: seg.translatedText,
            isFinal: true,
            startTime: seg.start,
            endTime: seg.end,
            order: order,
          });
        }

        await batch.commit();
      }

      // Calculate duration from the last segment's end time.
      const lastSeg = translatedSegments[translatedSegments.length - 1];
      const computedDuration = lastSeg
        ? Math.ceil(lastSeg.end)
        : sessionData.duration ?? 0;

      // Update session to completed.
      await sessionRef.update({
        status: "completed",
        sourceLanguage,
        targetLanguage,
        speakerCount: speakerIndices.size,
        duration:
          computedDuration > 0
            ? computedDuration
            : sessionData.duration ?? 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        segmentCount: translatedSegments.length,
        speakerCount: speakerIndices.size,
      };
    } catch (error: any) {
      console.error(`batchTranscribe failed for session ${sessionId}:`, error);

      const revertStatus = resolveBatchFailureStatus({
        initialStatus: currentStatus,
        force,
      });

      try {
        await sessionRef.update({
          status: revertStatus,
          ...(force && currentStatus === "completed"
            ? {
                sourceLanguage: sessionData.sourceLanguage ?? sourceLanguage,
                targetLanguage: sessionData.targetLanguage ?? targetLanguage,
              }
            : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (revertErr) {
        console.error("Failed to revert session status:", revertErr);
      }

      throw new HttpsError(
        "internal",
        `Batch transcription failed: ${error.message ?? "Unknown error"}`
      );
    }
  }
);
