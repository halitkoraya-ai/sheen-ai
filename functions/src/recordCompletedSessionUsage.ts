import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import {
  recordSessionUsage,
  shouldMeterCompletedSession,
  type SessionUsageData,
} from "./usageMetering";

const db = admin.firestore();

export const recordCompletedSessionUsage = onDocumentUpdated(
  "sessions/{sessionId}",
  async (event) => {
    const before = event.data?.before.data() as SessionUsageData | undefined;
    const afterSnap = event.data?.after;
    const after = afterSnap?.data() as SessionUsageData | undefined;

    if (!afterSnap || !after || !shouldMeterCompletedSession(before, after)) {
      return;
    }

    const uid = after.userId;
    if (!uid || typeof uid !== "string") {
      console.error(
        "recordCompletedSessionUsage: completed session missing userId",
        event.params.sessionId
      );
      return;
    }

    const durationSeconds =
      typeof after.duration === "number" ? after.duration : 0;

    await recordSessionUsage({
      db,
      sessionRef: afterSnap.ref,
      sessionData: after,
      uid,
      durationSeconds,
    });
  }
);
