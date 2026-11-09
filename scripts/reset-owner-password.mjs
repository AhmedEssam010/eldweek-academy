/**
 * تعيين كلمة مرور جديدة لحساب المالك الموجود (مرة واحدة / محلي فقط).
 *
 * الاستخدام (PowerShell):
 *   $env:OWNER_PHONE="+201023489110"
 *   $env:OWNER_PASSWORD="(باسورد جديد قوي >= 12)"
 *   node scripts/reset-owner-password.mjs
 *
 * يقرأ SUPABASE_SERVICE_ROLE_KEY و NEXT_PUBLIC_SUPABASE_URL من .env.local أو البيئة.
 * لا يطبع كلمة المرور ولا المفتاح.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const fileEnv = loadEnvLocal();
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  "";
const phoneRaw = process.env.OWNER_PHONE || "";
const password = process.env.OWNER_PASSWORD || "";

if (!url || !serviceKey) {
  console.error(
    "FAIL=missing_supabase_env HINT=Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or the shell.",
  );
  process.exit(1);
}

const normalized = normalizeEgyptianPhone(phoneRaw);
if (!normalized.ok) {
  console.error(
    `FAIL=bad_phone HINT=Set OWNER_PHONE like +2010xxxxxxxx (got error: ${normalized.error})`,
  );
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    "FAIL=weak_password HINT=Set OWNER_PASSWORD in the shell only (>=12 chars). It is never logged.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) {
  console.error(`FAIL=list_users code=${listError.status ?? "unknown"}`);
  process.exit(1);
}

const target = (listed?.users ?? []).find(
  (user) => String(user.phone ?? "").replace(/\s/g, "") === normalized.e164,
);

if (!target) {
  console.error(
    `FAIL=user_not_found phone=${maskPhone(normalized.e164)} HINT=Confirm the owner exists in Authentication > Users.`,
  );
  process.exit(1);
}

const { error: updateError } = await admin.auth.admin.updateUserById(
  target.id,
  {
    password,
    phone_confirm: true,
  },
);

if (updateError) {
  console.error(`FAIL=update_password code=${updateError.status ?? "unknown"}`);
  process.exit(1);
}

console.log(
  [
    "OK=password_updated",
    `phone=${maskPhone(normalized.e164)}`,
    `user=${String(target.id).slice(0, 8)}…`,
    "NEXT=Sign in at /login with the phone and the new password. Unset OWNER_PASSWORD from the shell.",
  ].join(" "),
);
