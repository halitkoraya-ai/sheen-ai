import * as admin from "firebase-admin";

export interface SessionUsageData {
  createdAt?: {toDate?: () => Date};
  duration?: number;
  status?: string;
  usageRecorded?: boolean;
  userId?: string;
}

export function shouldMeterCompletedSession(
  before: SessionUsageData | undefined,
  after: SessionUsageData | undefined
): boolean {
  if (!after || after.status !== "completed" || after.usageRecorded === true) {
    return false;
  }

  if (!before) {
    return true;
  }

  return (
    before.status !== "completed" ||
    before.duration !== after.duration ||
    before.usageRecorded !== after.usageRecorded
  );
}

export function resolveTrustedSeconds(
  sessionData: SessionUsageData,
  durationSeconds: number
): number {
  const storedDuration =
    typeof sessionData.duration === "number" ? sessionData.duration : 0;
  return Math.min(durationSeconds, Math.max(storedDuration, durationSeconds));
}

export function resolveMonthKey(sessionData: SessionUsageData): string {
  if (sessionData.createdAt?.toDate) {
    const sessionDate = sessionData.createdAt.toDate();
    return `${sessionDate.getFullYear()}-${String(
      sessionDate.getMonth() + 1
    ).padStart(2, "0")}`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function recordSessionUsage({
  db,
  sessionRef,
  sessionData,
  uid,
  durationSeconds,
}: {
  db: FirebaseFirestore.Firestore;
  sessionRef: FirebaseFirestore.DocumentReference;
  sessionData: SessionUsageData;
  uid: string;
  durationSeconds: number;
}): Promise<{alreadyFinalized: boolean; minutesUsed: number}> {
  if (sessionData.usageRecorded === true) {
    return {alreadyFinalized: true, minutesUsed: 0};
  }

  const trustedSeconds = resolveTrustedSeconds(sessionData, durationSeconds);
  const minutesUsed = Math.ceil(trustedSeconds / 60);

  if (minutesUsed > 0) {
    await db
      .collection("users")
      .doc(uid)
      .collection("usage")
      .doc(resolveMonthKey(sessionData))
      .set(
        {
          recordingMinutes: admin.firestore.FieldValue.increment(minutesUsed),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
  }

  await sessionRef.update({usageRecorded: true});

  return {alreadyFinalized: false, minutesUsed};
}
