import { existsSync, readFileSync } from "node:fs";

const path = ".env.local";
if (!existsSync(path)) {
  console.log("ENV_LOCAL=missing");
  process.exit(1);
}

const values = {};
for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  values[line.slice(0, i).trim()] = line
    .slice(i + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function flagState(name) {
  const raw = values[name];
  if (raw === undefined) return "unset";
  const on = ["true", "1", "yes"].includes(String(raw).toLowerCase());
  return on ? "enabled" : "disabled";
}

const flags = [
  "NEXT_PUBLIC_AUTH_PHONE_PASSWORD_READY",
  "NEXT_PUBLIC_AUTH_PHONE_PROVIDER_READY",
  "NEXT_PUBLIC_AUTH_PHONE_CONFIRMATIONS_DISABLED",
  "NEXT_PUBLIC_DB_SCHEMA_READY",
];

console.log("AUTH_READINESS_FLAGS");
for (const flag of flags) {
  console.log(`${flag}=${flagState(flag)}`);
}
console.log(
  `HAS_SERVICE_ROLE_KEY=${values.SUPABASE_SERVICE_ROLE_KEY ? "present" : "absent"}`,
);
console.log(
  `HAS_DATABASE_URL=${
    values.DATABASE_URL || values.SUPABASE_DB_URL ? "present" : "absent"
  }`,
);
