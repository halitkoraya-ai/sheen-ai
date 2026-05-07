import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

const db = admin.firestore();
const storage = admin.storage();

const BATCH_SIZE = 100;
const PAGE_SIZE = 50;

interface DeletionFailure {
  path: string;
  error: string;
  /** Document IDs that may still exist (for automated retry). */
  docIds?: string[];
}

/**
 * Callable Cloud Function that deletes ALL data for the authenticated user.
 *
 * Deletion order:
 * 1. Top-level sessions (paginated) + their subcollections
 * 2. User subcollections (usage, etc.)
 * 3. Cloud Storage files (audio, exports)
 * 4. User Firestore document
 * 5. Firebase Auth account
 *
 * All queries are paginated. Partial failures are recorded in
 * `deletions/{uid}` with structured data for automated retry.
 */
export const deleteUserData = onCall(
  {timeoutSeconds: 540},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to delete your account."
      );
    }

    const failures: DeletionFailure[] = [];
    let authDeleted = false;

    /**
     * Deletes all docs in a collection/query, paginated.
     * Returns `true` if fully successful, `false` if any batch failed.
     */
    async function deleteCollection(
      ref: admin.firestore.CollectionReference | admin.firestore.Query,
      label: string
    ): Promise<boolean> {
      let maxRetries = 3;
      let fullyDeleted = true;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const snap = await ref.limit(BATCH_SIZE).get();
        if (snap.docs.length === 0) break;

        const batch = db.batch();
        for (const doc of snap.docs) {
          batch.delete(doc.ref);
        }
        try {
          await batch.commit();
        } catch (err) {
          maxRetries--;
          if (maxRetries <= 0) {
            failures.push({
              path: label,
              error: `batch delete failed after retries: ${err}`,
              docIds: snap.docs.map((d) => d.id),
            });
            fullyDeleted = false;
            break;
          }
          continue;
        }

        if (snap.docs.length < BATCH_SIZE) break;
      }
      return fullyDeleted;
    }

    // --- 1. Delete top-level sessions (paginated by createdAt) ---
    try {
      let lastSessionDoc:
        | admin.firestore.QueryDocumentSnapshot
        | undefined;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = db
          .collection("sessions")
          .where("userId", "==", uid)
          .limit(PAGE_SIZE);

        if (lastSessionDoc) {
          q = q.startAfter(lastSessionDoc);
        }

        const sessionsSnap = await q.get();
        if (sessionsSnap.docs.length === 0) break;

        for (const sessionDoc of sessionsSnap.docs) {
          // Delete subcollections FIRST, then parent.
          let subsFailed = false;

          for (const sub of ["segments", "chatMessages"]) {
            try {
              const ok = await deleteCollection(
                sessionDoc.ref.collection(sub),
                `sessions/${sessionDoc.id}/${sub}`
              );
              if (!ok) subsFailed = true;
            } catch (err) {
              failures.push({
                path: `sessions/${sessionDoc.id}/${sub}`,
                error: String(err),
              });
              subsFailed = true;
            }
          }

          // Only delete parent if subcollections were cleaned up.
          if (!subsFailed) {
            try {
              await sessionDoc.ref.delete();
            } catch (err) {
              failures.push({
                path: `sessions/${sessionDoc.id}`,
                error: `parent delete failed: ${err}`,
              });
            }
          } else {
            // Keep parent so subcollections remain discoverable.
            failures.push({
              path: `sessions/${sessionDoc.id}`,
              error: "skipped — subcollection cleanup failed",
            });
          }
        }

        lastSessionDoc =
          sessionsSnap.docs[sessionsSnap.docs.length - 1];
        if (sessionsSnap.docs.length < PAGE_SIZE) break;
      }
    } catch (err) {
      failures.push({
        path: "sessions (query)",
        error: `paginated query failed: ${err}`,
      });
    }

    // --- 2. Delete user subcollections ---
    const userRef = db.collection("users").doc(uid);
    for (const sub of ["usage", "sessions", "summaries"]) {
      try {
        await deleteCollection(
          userRef.collection(sub),
          `users/${uid}/${sub}`
        );
      } catch (err) {
        failures.push({
          path: `users/${uid}/${sub}`,
          error: String(err),
        });
      }
    }

    // --- 3. Delete Cloud Storage files ---
    const bucket = storage.bucket();
    for (const prefix of [`audio/${uid}/`, `exports/${uid}/`]) {
      try {
        await bucket.deleteFiles({prefix});
      } catch (err) {
        failures.push({
          path: `storage:${prefix}`,
          error: String(err),
        });
      }
    }

    // --- 4. Delete user Firestore document ---
    try {
      await userRef.delete();
    } catch (err) {
      failures.push({
        path: `users/${uid}`,
        error: `delete failed: ${err}`,
      });
    }

    // --- 5. Delete Firebase Auth account ---
    try {
      await admin.auth().deleteUser(uid);
      authDeleted = true;
    } catch (err) {
      failures.push({
        path: `auth/${uid}`,
        error: String(err),
      });
    }

    // --- 6. Record failures for future cleanup ---
    if (failures.length > 0) {
      console.warn(
        `[${uid}] Deletion completed with ${failures.length} failure(s)`
      );

      try {
        await db.collection("deletions").doc(uid).set({
          uid,
          failures,
          authDeleted,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          resolved: false,
        });
      } catch (cleanupErr) {
        // Last resort: log to Cloud Logging so it's not silently lost.
        console.error(
          `[${uid}] CRITICAL: Failed to write cleanup record:`,
          cleanupErr,
          "Original failures:",
          JSON.stringify(failures)
        );
      }

      return {
        success: false,
        partial: true,
        authDeleted,
        failureCount: failures.length,
        message:
          "Account partially deleted. Some data may require cleanup.",
      };
    }

    console.log(`[${uid}] Account fully deleted — no failures.`);
    return {success: true, authDeleted: true};
  }
);
