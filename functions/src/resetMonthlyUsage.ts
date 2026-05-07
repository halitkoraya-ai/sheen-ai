import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

// Initialize admin if not already done.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Scheduled Cloud Function that runs on the 1st of each month at 00:05 UTC.
 *
 * Creates a new usage document at `users/{userId}/usage/{YYYY-MM}` for every
 * user, initializing recording minutes to 0. This ensures clean monthly
 * tracking without relying on client-side creation.
 */
export const resetMonthlyUsage = onSchedule(
  {
    schedule: "5 0 1 * *", // 00:05 UTC on the 1st of every month
    timeZone: "UTC",
  },
  async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const monthKey = `${year}-${month}`;

    // Fetch all users in batches.
    const usersRef = db.collection("users");
    let lastDoc: admin.firestore.DocumentSnapshot | undefined;
    let totalCreated = 0;
    const batchSize = 500;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query = usersRef.orderBy("__name__").limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      const batch = db.batch();
      for (const userDoc of snapshot.docs) {
        const usageRef = usersRef
          .doc(userDoc.id)
          .collection("usage")
          .doc(monthKey);
        batch.set(
          usageRef,
          {
            recordingMinutes: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true} // Don't overwrite if already exists
        );
      }

      await batch.commit();
      totalCreated += snapshot.docs.length;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      if (snapshot.docs.length < batchSize) break;
    }

    console.log(
      `Monthly usage reset: created ${totalCreated} usage docs for ${monthKey}`
    );
  }
);
