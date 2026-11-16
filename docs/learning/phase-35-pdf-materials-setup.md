# PHASE 35 — إعداد مواد PDF يدويًا

لا تُطبَّق الهجرة تلقائيًا على الإنتاج.

## 1) تطبيق الهجرة

في لوحة Supabase → SQL Editor، نفّذ ملف:

`supabase/migrations/20261111120000_course_pdf_materials.sql`

أو عبر CLI محليًا على مشروعك:

```bash
npx supabase db query --remote --yes --file supabase/migrations/20261111120000_course_pdf_materials.sql
```

## 2) التحقق من السلة

Storage → Buckets → يجب وجود سلة خاصة:

- الاسم: `course-materials`
- Public: **false**
- حد الحجم: 50MB
- MIME: `application/pdf`

## 3) متغيرات الخادم

تأكد من وجود:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (أو المفتاح القابل للنشر)
- `SUPABASE_SERVICE_ROLE_KEY` — مطلوب للتحقق من الملف بعد الرفع ولإنشاء روابط موقّعة للطلاب

## 4) مسار التخزين

`{course_id}/{semester_id}/{uuid}.pdf`

الطلاب لا يقرأون الكائنات مباشرة من Storage؛ يحصلون على رابط موقّت بعد التحقق من الاشتراك النشط على الخادم.
