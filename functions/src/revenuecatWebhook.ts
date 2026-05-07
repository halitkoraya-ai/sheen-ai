import {onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Initialize admin if not already done.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/** Maps RevenueCat entitlement identifiers to Sheen tier strings. */
function entitlementToTier(entitlementId: string): string {
  switch (entitlementId) {
  case "unlimited":
    return "unlimited";
  case "pro":
    return "pro";
  case "basic":
    return "basic";
  default:
    return "free";
  }
}

/**
 * HTTP Cloud Function that receives RevenueCat webhook events.
 *
 * Verifies the webhook authorization header, then updates the user's
 * subscription tier in Firestore based on the event type.
 *
 * Supported events:
 * - INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, UNCANCELLATION → set tier
 * - CANCELLATION, EXPIRATION, BILLING_ISSUE → revert to "free"
 */
export const revenuecatWebhook = onRequest(
  {maxInstances: 10},
  async (req, res) => {
    // Only accept POST.
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Verify webhook authorization header.
    const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.error("REVENUECAT_WEBHOOK_SECRET not configured");
      res.status(500).send("Webhook not configured");
      return;
    }
    const authHeader = req.headers["authorization"];
    if (authHeader !== `Bearer ${expectedSecret}`) {
      res.status(401).send("Unauthorized");
      return;
    }

    try {
      const event = req.body?.event;
      if (!event) {
        res.status(400).send("Missing event payload");
        return;
      }

      const eventType: string = event.type;
      const appUserId: string | undefined = event.app_user_id;
      const entitlementIds: string[] =
        event.entitlement_ids || [];

      if (!appUserId) {
        res.status(400).send("Missing app_user_id");
        return;
      }

      // Determine the new tier based on event type.
      let newTier = "free";

      switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
      case "UNCANCELLATION":
        // Use the highest-priority entitlement.
        if (entitlementIds.includes("unlimited")) {
          newTier = "unlimited";
        } else if (entitlementIds.includes("pro")) {
          newTier = "pro";
        } else if (entitlementIds.includes("basic")) {
          newTier = "basic";
        } else if (entitlementIds.length > 0) {
          newTier = entitlementToTier(entitlementIds[0]);
        }
        break;

      case "CANCELLATION":
      case "EXPIRATION":
      case "BILLING_ISSUE":
        newTier = "free";
        break;

      default:
        // Unknown event type — acknowledge but don't modify.
        res.status(200).send("Event type not handled");
        return;
      }

      // Update the user's tier in Firestore (use set+merge so it works
      // even if the user document doesn't exist yet).
      await db.collection("users").doc(appUserId).set({
        tier: newTier,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      res.status(200).json({
        success: true,
        userId: appUserId,
        newTier,
        eventType,
      });
    } catch (error) {
      console.error("RevenueCat webhook error:", error);
      res.status(500).send("Internal server error");
    }
  }
);
