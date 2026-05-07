/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// AI Chat function — Claude-powered meeting transcript analysis.
export {aiChat} from "./aiChat";

// RevenueCat webhook — syncs subscription tier changes to Firestore.
export {revenuecatWebhook} from "./revenuecatWebhook";

// Monthly usage reset — creates fresh usage docs on the 1st of each month.
export {resetMonthlyUsage} from "./resetMonthlyUsage";

// Export transcript — generates PDF, DOCX, or TXT exports.
export {exportTranscript} from "./exportTranscript";

// Session finalization — server-side usage metering.
export {finalizeSession} from "./finalizeSession";
export {recordCompletedSessionUsage} from "./recordCompletedSessionUsage";

// Account deletion — deletes all user data, storage files, and auth account.
export {deleteUserData} from "./deleteUserData";

// Batch transcription — processes offline-recorded audio files.
export {batchTranscribe} from "./batchTranscribe";

// Re-translation — reuses existing transcript text with a new target language.
export {retranslate} from "./retranslate";
