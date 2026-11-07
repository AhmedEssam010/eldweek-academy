/**
 * فحص غير مدمّر: هل يوجد super_admin؟ بدون طباعة بيانات شخصية.
 */
import { spawnSync } from "node:child_process";

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
console.log("OWNER_STATUS_CHECK");
console.log(`CLI_EXIT=${result.status}`);

if (result.status !== 0) {
  if (combined.includes("HostedMutationConsentRequiredError")) {
    console.log("RESULT=blocked_needs_read_only_or_yes");
  } else {
    console.log("RESULT=failed");
  }
  process.exit(1);
}

const start = combined.indexOf("{");
const end = combined.lastIndexOf("}");
if (start < 0 || end <= start) {
  console.log("RESULT=parse_error");
  process.exit(1);
}

const parsed = JSON.parse(combined.slice(start, end + 1));
const row = Array.isArray(parsed.rows) ? parsed.rows[0] : parsed;
const superCount = Number(row?.super_admin_count ?? 0);
const activeCount = Number(row?.active_super_admin_count ?? 0);
const authUsers = Number(row?.auth_users_count ?? 0);
const profiles = Number(row?.profiles_count ?? 0);

console.log(`SUPER_ADMIN_COUNT=${superCount}`);
console.log(`ACTIVE_SUPER_ADMIN_COUNT=${activeCount}`);
console.log(`AUTH_USERS_COUNT=${authUsers}`);
console.log(`PROFILES_COUNT=${profiles}`);
console.log(
  `OWNER_EXISTS=${superCount > 0 ? "yes" : "no"}`,
);
console.log("RESULT=ok");
