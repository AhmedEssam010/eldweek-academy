import { readFileSync, existsSync } from "node:fs";

const file = ".env.local";
if (!existsSync(file)) {
  console.log("ENV_FILE=missing");
  process.exit(0);
}

const text = readFileSync(file, "utf8");
const keys = [
  "MUX_TOKEN_ID",
  "MUX_TOKEN_SECRET",
  "MUX_SIGNING_KEY",
  "MUX_PRIVATE_KEY",
  "MUX_SIGNING_KEY_ID",
  "MUX_SIGNING_PRIVATE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of keys) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  const value = line ? line.slice(key.length + 1).trim() : "";
  console.log(`${key}=${value ? "set" : "missing"}`);
}
