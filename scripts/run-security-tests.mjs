/**
 * تشغيل supabase/tests/security_suite.sql ضد قاعدة LOCAL فقط.
 * لا يدّعي النجاح إن لم تُنفَّذ الاختبارات فعليًا.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const suitePath = resolve(root, "supabase/tests/security_suite.sql");

const UNTESTED_WHEN_SKIPPED = [
  "anon lessons_catalog visibility",
  "student role/phone/payment/enrollment/assignment denial under SET ROLE authenticated",
  "teacher assigned-vs-unassigned course boundaries",
  "owner-only publish/approve/staff assignment",
  "payment approval idempotency and renewal",
  "expired enrollment access denial",
  "GUC cannot authorize enrollment writes",
  "multi-session concurrency races",
];

function print(status, detail) {
  console.log(`RESULT=${status}`);
  if (detail) console.log(detail);
}

function printUntested() {
  console.log("UNTESTED=");
  for (const item of UNTESTED_WHEN_SKIPPED) {
    console.log(`- ${item}`);
  }
}

if (!existsSync(suitePath)) {
  print("failed", "CODE=missing_suite");
  process.exit(1);
}

let databaseUrl =
  process.env.SECURITY_TEST_DATABASE_URL || process.env.LOCAL_SUPABASE_DB_URL || "";

if (!databaseUrl) {
  const status = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });

  if (status.status !== 0) {
    print(
      "skipped",
      [
        "CODE=no_local_database",
        "REASON=Docker/local Supabase DB unavailable; security SQL suite was NOT executed.",
        "HINT=Start disposable local Supabase, apply migrations, then rerun npm run test:security",
      ].join("\n"),
    );
    printUntested();
    process.exit(2);
  }

  const match = status.stdout.match(/^DB_URL=(.+)$/m);
  if (!match) {
    print(
      "skipped",
      "CODE=no_db_url_in_status\nREASON=supabase status ran but DB_URL was not found.",
    );
    printUntested();
    process.exit(2);
  }

  databaseUrl = match[1].trim();
}

const hostIsLocal =
  /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/i.test(databaseUrl);

if (!hostIsLocal) {
  print(
    "refused",
    "CODE=non_local_database\nREASON=Refusing to run destructive security tests against a non-local database URL.",
  );
  process.exit(3);
}

const psqlCheck = spawnSync("psql", ["--version"], {
  encoding: "utf8",
  shell: true,
});

if (psqlCheck.error?.code === "ENOENT" || psqlCheck.status !== 0) {
  print(
    "skipped",
    "CODE=psql_missing\nREASON=psql is not installed; suite exists but was NOT executed.",
  );
  printUntested();
  process.exit(2);
}

const psql = spawnSync(
  "psql",
  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", suitePath],
  { cwd: root, encoding: "utf8", shell: true },
);

if (psql.status !== 0) {
  print(
    "failed",
    [
      "CODE=suite_failed",
      "NOTE=Authorization assertions failed or setup incompatible with local Supabase schema.",
      `STDERR_LEN=${psql.stderr ? psql.stderr.length : 0}`,
      "CONCURRENCY_NOTE=Multi-session race tests are not included in this suite.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!`${psql.stdout}\n${psql.stderr}`.includes("SECURITY_SUITE_PASSED")) {
  print(
    "failed",
    "CODE=missing_pass_notice\nREASON=psql exited 0 but SECURITY_SUITE_PASSED was not observed.",
  );
  process.exit(1);
}

print(
  "ok",
  [
    "CODE=security_suite_passed",
    "NOTE=Single-session authorization suite passed.",
    "REMAINING=Multi-session concurrency races still require separate database sessions.",
  ].join("\n"),
);
process.exit(0);
