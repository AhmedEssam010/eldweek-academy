/**
 * تحقق غير مدمّر من المخطط عبر Supabase CLI (--linked).
 * لا يطبع أسرارًا.
 */
import { spawnSync } from "node:child_process";

function runSql(sql) {
  const result = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "--output-format", "json", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function extractRows(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.result)) return parsed.result;
    return [parsed];
  } catch {
    // قد يخلط CLI تحذيرات npm مع JSON
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return [];
      }
    }
    return [];
  }
}

const expectedTables = [
  "profiles",
  "courses",
  "course_staff_assignments",
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
];

const tablesSql = `
SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = ANY (ARRAY[${expectedTables.map((t) => `'${t}'`).join(",")}])
ORDER BY c.relname;
`;

const policiesSql = `
SELECT tablename, count(*)::int AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[${expectedTables.map((t) => `'${t}'`).join(",")}])
GROUP BY tablename
ORDER BY tablename;
`;

const functionsSql = `
SELECT p.proname AS name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = ANY (ARRAY[
    'set_updated_at',
    'is_super_admin',
    'teacher_has_course_permission',
    'student_has_active_enrollment_for_course',
    'student_has_active_enrollment_for_semester',
    'student_has_active_enrollment_for_lesson',
    'student_has_active_enrollment_for_exam',
    'get_lesson_playback_grant',
    'exam_course_id',
    'exam_course_id_from_scope',
    'start_exam_attempt',
    'submit_exam_attempt',
    'protect_exam_mutations',
    'enforce_exam_scope_consistency'
  ])
ORDER BY p.proname;
`;

const triggersSql = `
SELECT event_object_table AS table_name, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('exams','profiles','courses','lessons','payment_requests','lesson_progress')
ORDER BY event_object_table, trigger_name;
`;

const examColsSql = `
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('exams','exam_questions','exam_options','exam_attempts','exam_answers')
ORDER BY table_name, ordinal_position;
`;

const viewSql = `
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('lessons_catalog','exam_options_for_taking')
ORDER BY table_name;
`;

console.log("VERIFY_REMOTE_SCHEMA");

const tables = runSql(tablesSql);
const tableRows = extractRows(tables.stdout);
console.log(`TABLES_QUERY_STATUS=${tables.status}`);
console.log(`TABLES_FOUND=${tableRows.length}`);
for (const row of tableRows) {
  console.log(
    `TABLE=${row.name};rls=${row.rls};force_rls=${row.force_rls}`,
  );
}
const missingTables = expectedTables.filter(
  (name) => !tableRows.some((row) => row.name === name),
);
console.log(`MISSING_TABLES=${missingTables.join(",") || "none"}`);

const policies = runSql(policiesSql);
const policyRows = extractRows(policies.stdout);
console.log(`POLICIES_QUERY_STATUS=${policies.status}`);
let policyTotal = 0;
for (const row of policyRows) {
  policyTotal += Number(row.policy_count || 0);
  console.log(`POLICY_TABLE=${row.tablename};count=${row.policy_count}`);
}
console.log(`POLICY_TOTAL=${policyTotal}`);

const functions = runSql(functionsSql);
const functionRows = extractRows(functions.stdout);
console.log(`FUNCTIONS_QUERY_STATUS=${functions.status}`);
console.log(`FUNCTIONS_FOUND=${functionRows.length}`);
console.log(
  `FUNCTIONS=${functionRows.map((row) => row.name).join(",") || "none"}`,
);

const triggers = runSql(triggersSql);
const triggerRows = extractRows(triggers.stdout);
console.log(`TRIGGERS_QUERY_STATUS=${triggers.status}`);
console.log(`TRIGGERS_FOUND=${triggerRows.length}`);
for (const row of triggerRows) {
  console.log(`TRIGGER=${row.table_name}.${row.trigger_name}`);
}

const views = runSql(viewSql);
const viewRows = extractRows(views.stdout);
console.log(`VIEWS_QUERY_STATUS=${views.status}`);
console.log(`VIEWS=${viewRows.map((row) => row.table_name).join(",") || "none"}`);

const examCols = runSql(examColsSql);
const examColRows = extractRows(examCols.stdout);
const examTables = new Set(examColRows.map((row) => row.table_name));
console.log(`EXAM_TABLES_WITH_COLUMNS=${[...examTables].sort().join(",") || "none"}`);
console.log(`EXAM_COLUMN_COUNT=${examColRows.length}`);

const ok =
  missingTables.length === 0 &&
  policyTotal > 0 &&
  functionRows.length >= 10 &&
  examTables.size === 5;

console.log(`RESULT=${ok ? "ok" : "incomplete"}`);
process.exit(ok ? 0 : 1);
