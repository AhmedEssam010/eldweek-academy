/**
 * تزويد لمرة واحدة لحساب المالك (super_admin).
 *
 * افتراضيًا: dry-run فقط.
 * التنفيذ الحقيقي يتطلب:
 *   --execute
 *   APPROVE_OWNER_PROVISION=yes
 *   OWNER_PHONE=...
 *   OWNER_PASSWORD=... (>=12، من البيئة فقط — لا تُطبع)
 *   SUPABASE_SERVICE_ROLE_KEY في البيئة (ليس NEXT_PUBLIC)
 *
 * Auth: phone_confirm=true مطلوب لـ signInWithPassword.
 * التطبيق: phone_verified_at يبقى NULL.
 * لا يطبع كلمات مرور أو مفاتيح أو أرقام كاملة.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return {};
  const values = {};
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    values[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function normalizeEgyptianPhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "missing_phone" };
  const digits = raw.replace(/[^\d+]/g, "");
  let national = "";
  if (digits.startsWith("+20")) national = `0${digits.slice(3)}`;
  else if (digits.startsWith("0020")) national = `0${digits.slice(4)}`;
  else if (digits.startsWith("20") && digits.length === 12)
    national = `0${digits.slice(2)}`;
  else if (digits.startsWith("0")) national = digits;
  else return { ok: false, error: "unsupported_format" };

  if (!/^(010|011|012|015)\d{8}$/.test(national)) {
    return { ok: false, error: "invalid_egyptian_mobile" };
  }
  return { ok: true, e164: `+20${national.slice(1)}` };
}

function maskPhone(e164) {
  if (!e164 || e164.length < 8) return "***";
  return `${e164.slice(0, 4)}****${e164.slice(-3)}`;
}

function maskId(id) {
  if (!id) return "***";
  return `${String(id).slice(0, 8)}…`;
}

function argFlag(name) {
  return process.argv.includes(name);
}

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return "";
}

function checkOwnerExists() {
  const result = spawnSync(
    "npx",
    [
      "supabase",
      "db",
      "query",
      "--remote",
      "--read-only",
      "--output-format",
      "json",
      "--file",
      "scripts/check-owner-status.sql",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: true,
      maxBuffer: 5 * 1024 * 1024,
    },
  );
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    return { ok: false, error: "owner_status_query_failed" };
  }
  const start = combined.indexOf("{");
  const end = combined.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, error: "owner_status_parse_failed" };
  }
  const parsed = JSON.parse(combined.slice(start, end + 1));
  const row = Array.isArray(parsed.rows) ? parsed.rows[0] : parsed;
  return {
    ok: true,
    superAdminCount: Number(row?.super_admin_count ?? 0),
    authUsersCount: Number(row?.auth_users_count ?? 0),
  };
}

const execute = argFlag("--execute");
const envLocal = loadEnvLocal();
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || "";
const phoneRaw =
  process.env.OWNER_PHONE || getArgValue("--phone") || "";
const fullName =
  process.env.OWNER_FULL_NAME ||
  getArgValue("--name") ||
  "المهندس أحمد الدويك";
const approved = process.env.APPROVE_OWNER_PROVISION === "yes";

console.log("OWNER_PROVISION_WORKFLOW");
console.log(`MODE=${execute ? "execute" : "dry-run"}`);
console.log(`APPROVED_ENV=${approved ? "yes" : "no"}`);

const ownerCheck = checkOwnerExists();
if (!ownerCheck.ok) {
  console.log(`RESULT=blocked`);
  console.log(`CODE=${ownerCheck.error}`);
  process.exit(1);
}

console.log(`EXISTING_SUPER_ADMIN_COUNT=${ownerCheck.superAdminCount}`);
console.log(`EXISTING_AUTH_USERS_COUNT=${ownerCheck.authUsersCount}`);

if (ownerCheck.superAdminCount > 0) {
  console.log("RESULT=blocked");
  console.log("CODE=super_admin_already_exists");
  process.exit(2);
}

const phone = normalizeEgyptianPhone(phoneRaw);
if (phoneRaw) {
  console.log(
    `PHONE=${phone.ok ? maskPhone(phone.e164) : "invalid"};ok=${phone.ok}`,
  );
} else {
  console.log("PHONE=not_provided");
}

console.log(`SERVICE_ROLE_PRESENT=${serviceRole ? "yes" : "no"}`);
console.log(`SUPABASE_URL_PRESENT=${url ? "yes" : "no"}`);

if (!execute) {
  console.log("PLAN=");
  console.log("- Create Auth user with phone+password via Admin API (service_role)");
  console.log("- phone_confirm=true (Auth phone_confirmed_at required for signInWithPassword; GoTrue rejects unconfirmed phone)");
  console.log("- profiles.phone_verified_at stays null (app ownership proof ≠ Auth usability)");
  console.log("- Call provision_super_admin(user_id, full_name, phone)");
  console.log("- On RPC failure: leave orphan student; recover by re-RPC or admin.deleteUser(that id only)");
  console.log("- Confirm exactly one super_admin row; second provision blocked by RPC + unique index");
  console.log("- Do not enable readiness flags / public registration / payments");
  console.log("RESULT=dry_run_ok");
  console.log(
    "NEXT=In shell only: OWNER_PHONE, OWNER_PASSWORD (>=12), SUPABASE_SERVICE_ROLE_KEY, APPROVE_OWNER_PROVISION=yes, then --execute after explicit chat approval",
  );
  process.exit(0);
}

if (!approved) {
  console.log("RESULT=blocked");
  console.log("CODE=missing_explicit_approval");
  process.exit(3);
}

if (!phone.ok) {
  console.log("RESULT=blocked");
  console.log("CODE=invalid_or_missing_phone");
  process.exit(3);
}

if (!url || !serviceRole) {
  console.log("RESULT=blocked");
  console.log("CODE=missing_url_or_service_role");
  process.exit(3);
}

const password = process.env.OWNER_PASSWORD || "";
if (!password || password.length < 12) {
  console.log("RESULT=blocked");
  console.log("CODE=missing_or_weak_owner_password");
  console.log(
    "HINT=Set OWNER_PASSWORD in the shell only (>=12 chars). It is never logged.",
  );
  process.exit(3);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// phone_confirm: true = Auth usability only (phone_confirmed_at).
// Required: GoTrue password grant rejects !IsPhoneConfirmed() regardless of sms_autoconfirm.
// App ownership proof remains profiles.phone_verified_at (left NULL by provision_super_admin).
const { data: created, error: createError } =
  await admin.auth.admin.createUser({
    phone: phone.e164,
    password,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  });

if (createError) {
  console.log("RESULT=failed");
  console.log("CODE=auth_create_failed");
  console.log(`ERROR_NAME=${createError.name || "unknown"}`);
  // Safe diagnostics only — never log keys/passwords/full phone.
  console.log(`ERROR_STATUS=${createError.status ?? "unknown"}`);
  console.log(`ERROR_CODE=${createError.code || "unknown"}`);
  console.log(
    `ERROR_MESSAGE=${String(createError.message || "unknown").slice(0, 200)}`,
  );
  process.exit(1);
}

const userId = created.user?.id;
if (!userId) {
  console.log("RESULT=failed");
  console.log("CODE=missing_user_id");
  process.exit(1);
}

console.log(`AUTH_USER=${maskId(userId)}`);

const { error: provisionError } = await admin.rpc("provision_super_admin", {
  p_user_id: userId,
  p_full_name: fullName,
  p_phone_number: phone.e164,
});

if (provisionError) {
  console.log("RESULT=failed");
  console.log("CODE=provision_rpc_failed");
  console.log(`ERROR_NAME=${provisionError.code || provisionError.name || "unknown"}`);
  console.log(`ORPHAN_AUTH_USER=${maskId(userId)}`);
  console.log("RECOVERY_PREFERRED=reinvoke provision_super_admin for this user_id only");
  console.log(
    "RECOVERY_ABORT=auth.admin.deleteUser(this_user_id_only) cascades profiles; never bulk-delete",
  );
  process.exit(1);
}

const verify = checkOwnerExists();
console.log(
  `POST_SUPER_ADMIN_COUNT=${verify.ok ? verify.superAdminCount : "unknown"}`,
);

console.log("PHONE_VERIFIED_AT=left_null");
console.log("AUTH_PHONE_CONFIRM=true");
console.log("RESULT=ok");
console.log("CODE=owner_provisioned");
console.log(
  "NEXT=Unset SUPABASE_SERVICE_ROLE_KEY / OWNER_PASSWORD from the shell; sign in via /login; keep readiness flags off until you approve",
);
