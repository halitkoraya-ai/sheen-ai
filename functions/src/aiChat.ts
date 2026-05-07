import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import {GoogleGenAI} from "@google/genai";

// Initialize admin if not already done.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Secret reference for the Gemini API key. Set with:
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * The value lives in Google Secret Manager — never commit it.
 */
const geminiKey = defineSecret("GEMINI_API_KEY");

/**
 * AI query limits per subscription tier (queries / month).
 *  -1 = unlimited.
 *
 * Mirrors PLANS.limits.aiChatQueriesPerMonth in the web client. Keep
 * these two tables in sync when re-pricing — server enforcement is the
 * source of truth, the client copy is just for UI hints.
 */
const TIER_LIMITS: Record<string, number> = {
  free: 0,
  advance: 50,
  premium: 200,
  professional: 800,
  // legacy aliases — old user docs may still carry these.
  basic: 0,
  pro: 800,
  unlimited: 800,
};

/** Models available to each tier. Order matters: first = default. */
const TIER_MODELS: Record<string, ("flash" | "pro")[]> = {
  free: [],
  advance: ["flash"],
  premium: ["flash", "pro"],
  professional: ["flash", "pro"],
  basic: [],
  pro: ["flash", "pro"],
  unlimited: ["flash", "pro"],
};

const MODEL_IDS = {
  flash: "gemini-2.5-flash",
  pro:   "gemini-2.5-pro",
} as const;

/**
 * Heuristic router: decides whether a question is "deep" enough to warrant
 * Pro instead of Flash. The intent is to keep ~80–90% of traffic on Flash
 * (cheap, fast) and only escalate when the user asks for something that
 * really benefits from larger reasoning capacity.
 */
const COMPLEX_PATTERNS = [
  /\b(compare|contrast|analy[sz]e|implication|tradeoff|nuance|why does|why did)\b/i,
  /\bvs\.?\s/i,
  /\b(karşılaştır|fark|çıkarım|neden|implicit|explicit)\b/i,
];
function shouldEscalate(message: string, autoRoute: boolean, available: ("flash" | "pro")[]): boolean {
  if (!autoRoute) return false;
  if (!available.includes("pro")) return false;
  if (message.length > 220) return true;            // long question → likely complex
  return COMPLEX_PATTERNS.some((re) => re.test(message));
}

/**
 * Callable Cloud Function: aiChat
 *
 * Receives a user message + sessionId + tier-driven options, loads the
 * full transcript, calls Gemini, persists both turns to chatMessages,
 * and returns the assistant reply along with the running quota.
 */
export const aiChat = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 20,
    secrets: [geminiKey],
  },
  async (request) => {
    // 1. Authenticate
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be signed in.");
    }

    // 2. Validate input
    const {sessionId, userMessage: rawUserMessage, message: rawMessageAlt, autoRoute: rawAutoRoute} =
      request.data || {};
    // Web client uses `message`, older Flutter client uses `userMessage`.
    const incoming = (typeof rawUserMessage === "string" && rawUserMessage)
      || (typeof rawMessageAlt === "string" && rawMessageAlt)
      || "";

    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }
    if (!incoming) {
      throw new HttpsError("invalid-argument", "message is required.");
    }

    const MAX_USER_MESSAGE_LENGTH = 2000;
    if (incoming.length > MAX_USER_MESSAGE_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `message must be ${MAX_USER_MESSAGE_LENGTH} characters or fewer.`
      );
    }
    const userMessage = incoming;
    const autoRoute   = !!rawAutoRoute;

    // 3. Tier lookup, ownership + atomic quota reservation.
    const userDoc  = await db.collection("users").doc(uid).get();
    const userData = userDoc.data() || {};
    const tier     = (userData.tier as string) || "free";
    const limit    = TIER_LIMITS[tier] ?? 0;
    const tierModels = TIER_MODELS[tier] ?? [];

    if (tierModels.length === 0 || limit === 0) {
      throw new HttpsError(
        "permission-denied",
        "Your current plan does not include AI chat. Upgrade to use this feature."
      );
    }

    const sessionRef = db.collection("sessions").doc(sessionId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sessionData: Record<string, any> = {};

    const aiQueriesUsed = await db.runTransaction(async (txn) => {
      const sessionDoc = await txn.get(sessionRef);
      if (!sessionDoc.exists) {
        throw new HttpsError("not-found", "Session not found.");
      }
      sessionData = sessionDoc.data() || {};

      if (sessionData.userId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "You do not have access to this session."
        );
      }

      // Per-session counter (legacy) PLUS the new monthly counter on the
      // user doc so the Usage screen can render a real progress bar.
      const used = (sessionData.aiQueriesUsed as number) || 0;
      const monthlyUsed = (userData.aiQueriesUsedThisMonth as number) || 0;

      if (limit > 0 && monthlyUsed >= limit) {
        throw new HttpsError(
          "resource-exhausted",
          `AI query limit reached (${monthlyUsed}/${limit}). ` +
            "Upgrade your plan for more queries."
        );
      }

      txn.update(sessionRef, {
        aiQueriesUsed: admin.firestore.FieldValue.increment(1),
      });
      txn.set(
        db.collection("users").doc(uid),
        {aiQueriesUsedThisMonth: admin.firestore.FieldValue.increment(1)},
        {merge: true}
      );

      return used;
    });

    // 4. Load + format transcript.
    const segmentsSnap = await db
      .collection("sessions")
      .doc(sessionId)
      .collection("segments")
      .orderBy("order")
      .get();

    let transcript = segmentsSnap.docs
      .map((doc) => {
        const d = doc.data();
        const speakerIndex = d.speakerIndex ?? 0;
        const speakerName =
          sessionData.speakerNames?.[String(speakerIndex)] ||
          `Speaker ${speakerIndex + 1}`;
        const startSeconds = d.startTime ?? 0;
        const minutes = Math.floor(startSeconds / 60);
        const seconds = Math.floor(startSeconds % 60);
        const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        return `[${timestamp}] ${speakerName}: ${d.originalText || ""}`;
      })
      .join("\n");

    const MAX_TRANSCRIPT_LENGTH = 100_000;
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      const halfCap = Math.floor(MAX_TRANSCRIPT_LENGTH / 2);
      const start = transcript.substring(0, halfCap);
      const end = transcript.substring(transcript.length - halfCap);
      transcript = start + "\n\n[... transcript truncated ...]\n\n" + end;
    }

    // 5. Pick model + call Gemini.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("internal", "Gemini API key is not configured.");
    }

    const escalate = shouldEscalate(userMessage, autoRoute, tierModels);
    const modelKey: "flash" | "pro" = escalate ? "pro" : "flash";
    const modelId  = MODEL_IDS[modelKey];

    const systemPrompt =
      "You are an AI assistant helping analyze a meeting recording. " +
      "The transcript below has speaker labels and timestamps. " +
      "When referencing specific moments, include the timestamp in " +
      "[MM:SS] format. Keep answers concise and grounded in the transcript " +
      "— do not invent facts.\n\n" +
      "TRANSCRIPT:\n" +
      transcript;

    const ai = new GoogleGenAI({apiKey});

    // I7-equivalent: 30 s wall-clock cap on the model call.
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 30_000);

    let assistantContent = "";
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [
          {role: "user", parts: [{text: userMessage}]},
        ],
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 1024,
          temperature: 0.4,
          abortSignal: controller.signal,
        },
      });
      assistantContent = (response.text || "").trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpsError("unavailable", `Gemini call failed: ${msg}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!assistantContent) {
      throw new HttpsError("internal", "Empty response from model.");
    }

    // 6. Pull [MM:SS] timestamps for jump-to-time chips.
    const timestampRegex = /\[(\d{1,2}):(\d{2})\]/g;
    const referencedTimestamps: number[] = [];
    let match;
    while ((match = timestampRegex.exec(assistantContent)) !== null) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      referencedTimestamps.push(mins * 60 + secs);
    }

    // 7. Persist both turns.
    const chatMessagesRef = db
      .collection("sessions")
      .doc(sessionId)
      .collection("chatMessages");

    const now = admin.firestore.FieldValue.serverTimestamp();

    await chatMessagesRef.add({
      role: "user",
      content: userMessage,
      referencedTimestamps: [],
      createdAt: now,
    });

    await chatMessagesRef.add({
      role: "assistant",
      content: assistantContent,
      referencedTimestamps,
      createdAt: now,
      modelUsed: modelKey,
    });

    return {
      content: assistantContent,
      referencedTimestamps,
      queriesUsed: aiQueriesUsed + 1,
      queryLimit: limit,
      modelUsed: modelKey,
    };
  }
);
