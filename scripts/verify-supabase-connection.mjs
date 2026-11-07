/**
 * فحص محلي لاتصال Supabase دون طباعة أي قيم سرية.
 * الاستخدام: npm run supabase:check
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return { exists: false, values: {} };
  }

  const values = {};
  const content = readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }

  return { exists: true, values };
}

function reportMissing(missing) {
  console.log("RESULT=failed");
  console.log("CODE=missing_env");
  console.log(`MISSING=${missing.join(",")}`);
}

const { exists, values } = loadEnvLocal();

if (!exists) {
  console.log("ENV_LOCAL=missing");
  reportMissing(REQUIRED_KEYS);
  process.exit(1);
}

console.log("ENV_LOCAL=present");
console.log("GITIGNORE=.env.local ignored via .env*");

const missing = REQUIRED_KEYS.filter((key) => !values[key]?.trim());
if (missing.length > 0) {
  reportMissing(missing);
  process.exit(1);
}

for (const key of REQUIRED_KEYS) {
  console.log(`${key}=present`);
}

const url = values.NEXT_PUBLIC_SUPABASE_URL.trim().replace(/\/$/, "");
const key = values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
const healthUrl = `${url}/auth/v1/health`;

try {
  const response = await fetch(healthUrl, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    console.log("RESULT=failed");
    console.log("CODE=unexpected_response");
    console.log(`HTTP_STATUS=${response.status}`);
    process.exit(1);
  }

  console.log("RESULT=ok");
  console.log("CODE=connected");
  console.log(`HTTP_STATUS=${response.status}`);
  process.exit(0);
} catch {
  console.log("RESULT=failed");
  console.log("CODE=unreachable");
  console.log("HTTP_STATUS=none");
  process.exit(1);
}
