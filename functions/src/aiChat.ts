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
 * Secret references. Each value lives in Google Secret Manager (never
 * in the repo) and is mounted into this function's runtime as an env
 * var with the same name. Set with:
 *   firebase functions:secrets:set GEMINI_API_KEY
 *   firebase functions:secrets:set DP_API_KEY        (DeepSeek)
 */
const geminiKey   = defineSecret("GEMINI_API_KEY");
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
 * Routing strategy (May 2026):
 *  • `flash`  Gemini 2.5 Flash       — cheapest, default for everyone
 *  • `v3`     DeepSeek V3 (chat)     — mid-tier reasoning, ~13x cheaper
 *                                       than Gemini Pro for similar quality
 *  • `r1`     DeepSeek R1 (reasoner) — chain-of-thought, deep analysis,
 *                                       still cheaper than Gemini Pro
 *  • `pro`    Gemini 2.5 Pro         — multimodal / very-long-context
 *                                       fallback, not routed by default
 */
type ModelKey = "flash" | "v3" | "r1" | "pro";

const TIER_MODELS: Record<string, ModelKey[]> = {
  free:         [],
  advance:      ["flash"],
  premium:      ["flash", "v3", "r1"],
  professional: ["flash", "v3", "r1", "pro"],
  // legacy aliases
  basic:        [],
  pro:          ["flash", "v3", "r1", "pro"],
  unlimited:    ["flash", "v3", "r1", "pro"],
};

const MODEL_IDS: Record<ModelKey, string> = {
  flash: "gemini-2.5-flash",
  pro:   "gemini-2.5-pro",
  v3:    "deepseek-chat",
  r1:    "deepseek-reasoner",
};

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

// ─── Stage 1: cheap heuristic ────────────────────────────────────────
//
// Most chat turns are short, single-clause questions — no point spending
// $0.0001 on a Flash classification when a regex match is 99% reliable.
// We classify only when the heuristic genuinely can't decide.
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

// ─── Stage 2: Flash-as-router ───────────────────────────────────────
//
// For ambiguous questions we send a 1-shot classification prompt to
// Flash with no transcript context (~80 input tokens, ~5 output).
// Output is a single word: simple | medium | deep. Cost is roughly
// $0.00005 — well below the saving we get from not over-escalating.
async function classifyComplexity(
  ai: GoogleGenAI,
  message: string,
): Promise<"simple" | "medium" | "deep"> {
  const prompt =
    "Classify the following meeting-Q&A question by complexity. " +
    "Reply with EXACTLY one word: simple, medium, or deep.\n" +
    "• simple  = factual look-up, single short clause, one timestamp.\n" +
    "• medium  = multi-part question, summarisation across several segments,\n" +
    "            comparing two named items.\n" +
    "• deep    = inference, motivation, implications, contradictions,\n" +
    "            cross-cutting analysis.\n\n" +
    "Question: " + message;
  try {
    const res = await ai.models.generateContent({
      model: MODEL_IDS.flash,
      contents: [{role: "user", parts: [{text: prompt}]}],
      config: {maxOutputTokens: 8, temperature: 0},
    });
    const raw = (res.text || "").trim().toLowerCase();
    if (raw.includes("deep"))   return "deep";
    if (raw.includes("medium")) return "medium";
    return "simple";
  } catch (e) {
    // If the router itself fails, default to "simple" so we never block
    // the user on the cheap path.
    console.warn("[aiChat] router classification failed:", (e as Error)?.message);
    return "simple";
  }
}

// ─── Stage 3: pick a model based on the verdict + tier access ────────
function pickModel(
  verdict: HeuristicVerdict | "simple" | "medium" | "deep",
  available: ModelKey[],
): ModelKey {
  // Free / locked tiers shouldn't reach this function; defensive default.
  if (available.length === 0) return "flash";
  const has = (m: ModelKey) => available.includes(m);

  switch (verdict) {
  case "deep":
    if (has("r1"))    return "r1";
    if (has("pro"))   return "pro";
    return "flash";
  case "medium":
  case "complex":
    if (has("v3"))    return "v3";
    if (has("r1"))    return "r1";
    if (has("pro"))   return "pro";
    return "flash";
  case "simple":
  case "ambiguous":
  default:
    return "flash";
  }
}

// ─── DeepSeek HTTP call (OpenAI-compatible /chat/completions) ────────
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
 * full transcript, calls Gemini, persists both turns to chatMessages,
 * and returns the assistant reply along with the running quota.
 */
export const aiChat = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 20,
    secrets: [geminiKey, deepseekKey],
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

    // 5. Pick model via two-stage router.
    const geminiApiKey   = process.env.GEMINI_API_KEY;
    const deepseekApiKey = process.env.DP_API_KEY;
    if (!geminiApiKey) {
      throw new HttpsError("internal", "Gemini API key is not configured.");
    }

    const systemPrompt =
      "You are an AI assistant helping analyze a meeting recording. " +
      "The transcript below has speaker labels and timestamps. " +
      "When referencing specific moments, include the timestamp in " +
      "[MM:SS] format. Keep answers concise and grounded in the transcript " +
      "— do not invent facts.\n\n" +
      "TRANSCRIPT:\n" +
      transcript;

    const ai = new GoogleGenAI({apiKey: geminiApiKey});

    // Stage 1: heuristic pre-filter (free).
    //
    // Only invoke the Flash router when the heuristic genuinely can't
    // decide. This keeps the common simple-Q case at exactly one LLM
    // call (Flash, full transcript) instead of two.
    let verdict: HeuristicVerdict | "simple" | "medium" | "deep" = preFilter(userMessage);

    // Stage 2: Flash classification for ambiguous + autoRoute tiers.
    if (verdict === "ambiguous" && autoRoute && (tierModels.includes("v3") || tierModels.includes("r1") || tierModels.includes("pro"))) {
      verdict = await classifyComplexity(ai, userMessage);
    } else if (verdict === "ambiguous") {
      // No autoRoute or no escalation models → just answer with Flash.
      verdict = "simple";
    }

    const modelKey = pickModel(verdict, tierModels);
    const modelId  = MODEL_IDS[modelKey];

    // ── Gemini context cache (Flash answers only) ────────────────────
    //
    // Caching helps when the user asks several questions in a row about
    // the same meeting: the transcript context is cached on Gemini's side
    // and subsequent input tokens are billed at ~25% of the normal rate.
    // We only cache for the Flash answer path — escalations to V3/R1/Pro
    // are rare and the create-cache overhead doesn't pay off on a single
    // deep-analysis call.
    const CACHE_TTL_SECONDS = 3600;          // 1 hour, refreshed on hit
    const CACHE_MIN_TRANSCRIPT_CHARS = 4096; // approx 1K tokens
    const shouldCache =
      modelKey === "flash" &&
      transcript.length >= CACHE_MIN_TRANSCRIPT_CHARS;

    let cacheName: string | null =
      typeof sessionData.geminiCacheName === "string" ? sessionData.geminiCacheName : null;

    if (shouldCache && cacheName) {
      try {
        const existing = await ai.caches.get({name: cacheName});
        const exp = existing.expireTime
          ? new Date(existing.expireTime).getTime()
          : 0;
        if (exp <= Date.now()) {
          cacheName = null;
        } else {
          try {
            await ai.caches.update({
              name: cacheName,
              config: {ttl: `${CACHE_TTL_SECONDS}s`},
            });
          } catch (e) {
            console.warn("[aiChat] cache TTL refresh failed:", (e as Error)?.message);
          }
        }
      } catch {
        cacheName = null;
      }
    } else if (!shouldCache) {
      cacheName = null;
    }

    if (shouldCache && !cacheName) {
      try {
        const cache = await ai.caches.create({
          model: modelId,
          config: {
            systemInstruction: systemPrompt,
            ttl: `${CACHE_TTL_SECONDS}s`,
            contents: [
              {role: "user", parts: [{text: "(Awaiting your question about the meeting.)"}]},
            ],
          },
        });
        cacheName = cache.name || null;
        if (cacheName) {
          try {
            await sessionRef.update({geminiCacheName: cacheName});
          } catch (e) {
            console.warn("[aiChat] persist cache name failed:", (e as Error)?.message);
          }
        }
      } catch (e) {
        console.warn("[aiChat] cache create failed, falling back to inline:", (e as Error)?.message);
        cacheName = null;
      }
    }

    // 30 s wall-clock cap on the model call.
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 30_000);

    let assistantContent = "";
    try {
      if (modelKey === "v3" || modelKey === "r1") {
        // DeepSeek path — OpenAI-compatible /chat/completions.
        if (!deepseekApiKey) {
          throw new Error("DeepSeek API key not configured.");
        }
        assistantContent = await callDeepSeek(
          modelId,
          deepseekApiKey,
          systemPrompt,
          userMessage,
          controller.signal,
        );
      } else {
        // Gemini path (Flash or Pro). Cache shape vs inline shape — the
        // cache subsumes systemInstruction + transcript.
        const baseConfig = {
          maxOutputTokens: 1024,
          temperature: 0.4,
          abortSignal: controller.signal as AbortSignal,
        };
        const response = cacheName
          ? await ai.models.generateContent({
            model: modelId,
            contents: [{role: "user", parts: [{text: userMessage}]}],
            config: {...baseConfig, cachedContent: cacheName},
          })
          : await ai.models.generateContent({
            model: modelId,
            contents: [{role: "user", parts: [{text: userMessage}]}],
            config: {...baseConfig, systemInstruction: systemPrompt},
          });
        assistantContent = (response.text || "").trim();
      }
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
