import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";

// Initialize admin if not already done.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Secret references. Each value lives in Google Secret Manager (never
 * in the repo) and is mounted into this function's runtime as an env
 * var with the same name. Set with:
 *   firebase functions:secrets:set DP_API_KEY        (DeepSeek)
 *
 * NOTE (May 2026 migration): The previous build also referenced
 * GEMINI_API_KEY for Flash/Pro routing + context caching. After moving
 * to a DeepSeek-only AI stack that secret can be deleted from Secret
 * Manager (`firebase functions:secrets:destroy GEMINI_API_KEY`) — no
 * runtime code reads it any more.
 */
const deepseekKey = defineSecret("DP_API_KEY");

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

/**
 * Models available to each tier. Order matters: first = default.
 *
 * DeepSeek-only stack (May 2026):
 *  • `v3`  DeepSeek V3 (deepseek-chat)    — default for everyone with
 *          AI access. Cheap, fast, broad world knowledge. Handles ~95%
 *          of meeting-Q&A traffic comfortably.
 *  • `r1`  DeepSeek R1 (deepseek-reasoner) — chain-of-thought, deep
 *          analysis. Routed in only when the heuristic detects an
 *          explicitly complex prompt (or autoRoute + long input). Costs
 *          ~2x V3 but still 3-5x cheaper than Gemini Pro for the same
 *          quality on reasoning-heavy tasks.
 *
 * The previous mix also exposed `flash` (Gemini 2.5 Flash) as the
 * default and `pro` (Gemini 2.5 Pro) as a multimodal fallback. Both
 * were removed to consolidate on a single provider, simplify ops, and
 * eliminate Google Cloud Vertex/AI-Studio billing line items.
 */
type ModelKey = "v3" | "r1";

const TIER_MODELS: Record<string, ModelKey[]> = {
  free:         [],
  advance:      ["v3"],
  premium:      ["v3", "r1"],
  professional: ["v3", "r1"],
  // legacy aliases
  basic:        [],
  pro:          ["v3", "r1"],
  unlimited:    ["v3", "r1"],
};

const MODEL_IDS: Record<ModelKey, string> = {
  v3: "deepseek-chat",
  r1: "deepseek-reasoner",
};

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

// ─── Routing: cheap heuristic only ──────────────────────────────────
//
// Previously we ran a 2-stage router (regex pre-filter + Flash 1-shot
// classifier for ambiguous cases). With a DeepSeek-only stack the
// classifier would itself cost a V3 call — wiping out any saving from
// routing to V3 instead of R1. So we drop the LLM classifier and rely
// purely on the free regex heuristic:
//   • simple   → V3   (cheap, fast)
//   • complex  → R1   (only if tier allows)
//   • ambiguous → V3  (default to cheap)
//
// R1 also automatically takes very long prompts (> 240 chars) since
// those almost always involve summarisation / multi-segment analysis.
const SIMPLE_PATTERNS = [
  // short factual look-ups ("when did X happen", "who said Y")
  /^(when|where|who|what|did|is|was|how long)\b/i,
  /^\s*(ne zaman|kim|nerede|nedir)\b/i,
];
const COMPLEX_PATTERNS = [
  /\b(compare|contrast|analy[sz]e|implication|tradeoff|nuance|imply|reason about|argue)\b/i,
  /\bvs\.?\s/i,
  /\b(karşılaştır|fark|çıkarım|tartış|gerekçe|analiz et|sebep)\b/i,
];

type HeuristicVerdict = "simple" | "complex" | "ambiguous";

function preFilter(message: string): HeuristicVerdict {
  const trimmed = message.trim();
  if (trimmed.length <= 60 && SIMPLE_PATTERNS.some((re) => re.test(trimmed))) {
    return "simple";
  }
  if (trimmed.length > 240) return "complex";
  if (COMPLEX_PATTERNS.some((re) => re.test(trimmed))) return "complex";
  return "ambiguous";
}

// Pick a model based on the verdict + tier access.
function pickModel(
  verdict: HeuristicVerdict,
  available: ModelKey[],
  autoRoute: boolean,
): ModelKey {
  // Free / locked tiers shouldn't reach this function; defensive default.
  if (available.length === 0) return "v3";
  const has = (m: ModelKey) => available.includes(m);

  switch (verdict) {
  case "complex":
    // Only escalate to R1 if the user's tier allows AND auto-route is on.
    // Advance tier has v3 only — they get v3 even on complex prompts.
    if (autoRoute && has("r1")) return "r1";
    return "v3";
  case "simple":
  case "ambiguous":
  default:
    return "v3";
  }
}

// ─── DeepSeek HTTP call (OpenAI-compatible /chat/completions) ────────
//
// DeepSeek auto-caches the system prompt server-side for repeat calls
// from the same account on the same model, so we don't need an explicit
// cache layer like we did for Gemini. Hits drop the input-token bill
// to ~10% of cold pricing automatically.
async function callDeepSeek(
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {role: "system", content: systemPrompt},
        {role: "user",   content: userMessage},
      ],
      max_tokens:  1024,
      temperature: 0.4,
      stream:      false,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as {
    choices?: Array<{message?: {content?: string}}>;
  };
  return (data.choices?.[0]?.message?.content || "").trim();
}

/**
 * Callable Cloud Function: aiChat
 *
 * Receives a user message + sessionId + tier-driven options, loads the
 * full transcript, calls DeepSeek (V3 by default, R1 for routed-deep
 * questions on Premium/Professional), persists both turns to
 * chatMessages, and returns the assistant reply along with the running
 * quota.
 */
export const aiChat = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 20,
    secrets: [deepseekKey],
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

    // 5. Pick model via heuristic-only router.
    const deepseekApiKey = process.env.DP_API_KEY;
    if (!deepseekApiKey) {
      throw new HttpsError("internal", "DeepSeek API key is not configured.");
    }

    const systemPrompt =
      "You are an AI assistant helping analyze a meeting recording. " +
      "The transcript below has speaker labels and timestamps. " +
      "When referencing specific moments, include the timestamp in " +
      "[MM:SS] format. Keep answers concise and grounded in the transcript " +
      "— do not invent facts.\n\n" +
      "TRANSCRIPT:\n" +
      transcript;

    const verdict  = preFilter(userMessage);
    const modelKey = pickModel(verdict, tierModels, autoRoute);
    const modelId  = MODEL_IDS[modelKey];

    // 30 s wall-clock cap on the model call.
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 30_000);

    let assistantContent = "";
    try {
      assistantContent = await callDeepSeek(
        modelId,
        deepseekApiKey,
        systemPrompt,
        userMessage,
        controller.signal,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpsError("unavailable", `Model call failed (${modelKey}): ${msg}`);
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
