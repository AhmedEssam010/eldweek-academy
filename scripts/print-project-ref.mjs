import { existsSync, readFileSync } from "node:fs";

const path = ".env.local";
if (!existsSync(path)) {
  console.log("PROJECT_REF=missing_env");
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

const url = (values.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
let ref = "";
try {
  ref = new URL(url).hostname.split(".")[0] || "";
} catch {
  ref = "parse_error";
}

console.log(`PROJECT_REF=${ref}`);
console.log(`REF_MATCH_EXPECTED=${ref === "ahmed-eldeweik-platform"}`);
console.log(
  `HOST_IS_SUPABASE=${url.includes(".supabase.co") ? "yes" : "no"}`,
);
