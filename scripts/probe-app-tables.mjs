/**
 * فحص غير مدمّر: هل جداول التطبيق ظاهرة عبر PostgREST؟
 * لا يطبع أسرارًا ولا يعدّل البيانات.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return {};
  const values = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return values;
}

const values = loadEnvLocal();
const url = values.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
const key = values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !key) {
  console.log("RESULT=failed");
  console.log("CODE=missing_env");
  process.exit(1);
}

const tables = [
  "profiles",
  "courses",
  "course_semesters",
  "lessons",
  "products",
  "payment_requests",
  "enrollments",
  "lesson_progress",
  "audit_logs",
  "exams",
  "exam_questions",
  "exam_options",
  "exam_attempts",
  "exam_answers",
  "course_staff_assignments",
];

console.log("REMOTE_APP_TABLE_PROBE");

let reachable = 0;
let missing = 0;
let other = 0;

for (const table of tables) {
  const endpoint = `${url}/rest/v1/${table}?select=id&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });

  const body = await response.text();
  let code = `http_${response.status}`;

  if (
    body.includes("PGRST205") ||
    body.toLowerCase().includes("could not find the table") ||
    body.includes("schema cache")
  ) {
    code = "missing_table";
    missing += 1;
  } else if (response.ok) {
    code = "table_reachable";
    reachable += 1;
  } else if (response.status === 401 || response.status === 403) {
    code = "auth_or_rls";
    other += 1;
  } else {
    other += 1;
  }

  console.log(`${table}=${code}`);
}

console.log(`SUMMARY_reachable=${reachable}`);
console.log(`SUMMARY_missing=${missing}`);
console.log(`SUMMARY_other=${other}`);
console.log(
  "NOTE=PostgREST visibility only; supabase_migrations history needs a privileged DB connection.",
);
process.exit(0);
