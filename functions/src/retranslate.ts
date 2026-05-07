import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {canRetranslateSession} from "./retranscriptionShared";

const db = admin.firestore();

export const retranslate = onCall(
  {timeoutSeconds: 540, memory: "1GiB"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const {sessionId, targetLanguage} = request.data as {
      sessionId?: string;
      targetLanguage?: string;
    };

    if (!sessionId || typeof sessionId !== "string") {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }
    if (!targetLanguage || typeof targetLanguage !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "targetLanguage is required."
      );
    }

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

    const currentStatus = (sessionData.status as string | undefined) ?? "";
    if (!canRetranslateSession(currentStatus)) {
      throw new HttpsError(
        "failed-precondition",
        `Session status is '${currentStatus}', expected 'completed'.`
      );
    }

    const sourceLanguage =
      (sessionData.sourceLanguage as string | undefined) ?? "en";
    const previousTargetLanguage =
      (sessionData.targetLanguage as string | undefined) ?? sourceLanguage;

    await sessionRef.update({
      status: "transcribing",
      targetLanguage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      const segmentsSnapshot = await sessionRef
        .collection("segments")
        .orderBy("order")
        .get();

      const {TranslationServiceClient} = await import(
        "@google-cloud/translate"
      );
      const translationClient = new TranslationServiceClient();
      const projectId = process.env.GOOGLE_CLOUD_PROJECT;
      const shouldTranslate = sourceLanguage !== targetLanguage;

      if (shouldTranslate && !projectId) {
        throw new Error("GOOGLE_CLOUD_PROJECT not configured");
      }

      const translatedSegments: Array<{
        ref: FirebaseFirestore.DocumentReference;
        translatedText: string | null;
      }> = [];

      for (const doc of segmentsSnapshot.docs) {
        const data = doc.data();
        const originalText =
          ((data.originalText as string | undefined) ?? "").trim();
        let translatedText: string | null = null;

        if (shouldTranslate && originalText.length > 0) {
          const [response] = await translationClient.translateText({
            parent: `projects/${projectId}/locations/global`,
            contents: [originalText],
            sourceLanguageCode: sourceLanguage,
            targetLanguageCode: targetLanguage,
            mimeType: "text/plain",
          });
          translatedText = response.translations?.[0]?.translatedText ?? null;
        }

        translatedSegments.push({
          ref: doc.ref,
          translatedText,
        });
      }

      const BATCH_LIMIT = 500;
      for (let i = 0; i < translatedSegments.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        const chunk = translatedSegments.slice(i, i + BATCH_LIMIT);

        for (const segment of chunk) {
          batch.update(segment.ref, {
            translatedText: segment.translatedText,
          });
        }

        await batch.commit();
      }

      await sessionRef.update({
        status: "completed",
        targetLanguage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        segmentCount: translatedSegments.length,
      };
    } catch (error: any) {
      console.error(`retranslate failed for session ${sessionId}:`, error);

      try {
        await sessionRef.update({
          status: "completed",
          targetLanguage: previousTargetLanguage,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (revertErr) {
        console.error("Failed to revert retranslate session state:", revertErr);
      }

      throw new HttpsError(
        "internal",
        `Re-translation failed: ${error.message ?? "Unknown error"}`
      );
    }
  }
);
