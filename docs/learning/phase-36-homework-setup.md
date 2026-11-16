# PHASE 36 — إعداد نظام الواجبات يدويًا

لا تُطبَّق الهجرات تلقائيًا على الإنتاج.

## ترتيب التنفيذ في SQL Editor

1. `supabase/migrations/20261111130000_homework_system.sql`
2. `supabase/migrations/20261111130100_homework_attempt_rpcs.sql`

أو عبر CLI:

```bash
npx supabase db query --remote --yes --file supabase/migrations/20261111130000_homework_system.sql
npx supabase db query --remote --yes --file supabase/migrations/20261111130100_homework_attempt_rpcs.sql
```

## التحقق

- جداول: `homeworks`, `homework_questions`, `homework_options`, `homework_question_guides`, `homework_attempts`, `homework_answers`
- دوال: `start_homework_attempt`, `submit_homework_attempt`, `save_homework_essay_grades_draft`, `finalize_homework_grading`, `get_homework_attempt_review`

لا تُعدَّل جداول الامتحانات التاريخية بهذه الهجرات.
