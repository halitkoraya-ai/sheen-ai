import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {recordSessionUsage} from "./usageMetering";

const db = admin.firestore();

/**
 * Callable Cloud Function that finalizes a recording session server-side.
 *
 * Performs privileged operations that should not be client-side:
 * - Increments the user's monthly recording usage (metering)
 * - Validates the duration isn't spoofed (optional future check)
 *
 * Called by the Flutter client after a recording stops.
 */
export const finalizeSession = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in."
    );
  }

  const {sessionId, durationSeconds} = request.data as {
    sessionId?: string;
    durationSeconds?: number;
  };

  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }
  if (
    durationSeconds === undefined ||
    typeof durationSeconds !== "number" ||
    durationSeconds < 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "durationSeconds must be a non-negative number."
    );
  }

  // Verify session belongs to this user and hasn't been finalized already.
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

  const result = await recordSessionUsage({
    db,
    sessionRef,
    sessionData,
    uid,
    durationSeconds,
  });

  return {
    success: true,
    minutesUsed: result.minutesUsed,
    alreadyFinalized: result.alreadyFinalized,
  };
});
