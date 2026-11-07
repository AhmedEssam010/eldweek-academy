/**
 * Send SMS Auth Hook — fail-closed.
 *
 * Official contract (Supabase Auth Hooks / Send SMS Hook):
 * - Auth signs the body with Standard Webhooks (webhook-id, webhook-timestamp, webhook-signature).
 * - Secret format: v1,whsec_<base64>; strip that prefix before Webhook.verify().
 * - Deploy with verify_jwt = false; authenticity is the webhook signature, not a user JWT.
 * - Success = HTTP 200 + JSON body (often {}).
 * - Business failure = HTTP 400/403 + Content-Type: application/json (Auth treats as error).
 *
 * This project does not send SMS OTP. Any Auth attempt to send SMS must fail closed.
 * With Phone confirmations disabled, Auth should not invoke this hook on password signup/login.
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        http_code: status,
        message,
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function resolveHookSecret(): string | undefined {
  // Official Auth Hooks docs: SEND_SMS_HOOK_SECRETS (plural).
  // Send SMS Hook examples sometimes use SEND_SMS_HOOK_SECRET (singular).
  return (
    Deno.env.get("SEND_SMS_HOOK_SECRETS") ?? Deno.env.get("SEND_SMS_HOOK_SECRET")
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonError(400, "Method not allowed");
  }

  const rawSecret = resolveHookSecret();
  if (!rawSecret) {
    console.error("SEND_SMS_HOOK_SECRETS / SEND_SMS_HOOK_SECRET is not configured");
    return jsonError(500, "Send SMS hook is misconfigured");
  }

  const hookSecret = rawSecret.replace("v1,whsec_", "");
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  try {
    // Verify signature before any business decision. Throws if invalid.
    wh.verify(payload, headers);
  } catch (error) {
    console.error("Send SMS hook signature verification failed", error);
    return jsonError(401, "Invalid webhook signature");
  }

  // Fail closed: never send SMS, never acknowledge success for OTP delivery.
  console.warn(
    "Send SMS hook invoked; SMS OTP is disabled for this project (fail-closed)",
  );
  return jsonError(
    403,
    "SMS OTP is disabled for this project. Phone+password auth must run with phone confirmations disabled.",
  );
});
