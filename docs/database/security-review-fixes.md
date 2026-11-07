# مراجعة أمنية للهجرات وإصلاحات مؤكدة

تاريخ المراجعة: 2026-11-01  
**لم تُطبَّق الهجرات على Supabase البعيد، ولم تُنفَّذ الاختبارات على قاعدة محلية (Docker/psql غير متوفرين).**

## المشاكل المؤكدة وما تم إصلاحه

### 1) `lessons_catalog` مع `anon`
- **المشكلة:** العرض كان `security_invoker=true` بينما `lessons` بلا منح SELECT لـ `anon`، فيتعطل الكتالوج العام.
- **الإصلاح:** تحويل العرض إلى `security_invoker=false` + `security_barrier=true` مع تصفية `is_published` وكورس `published` فقط، بدون عمود `video_asset_id`.

### 2) اعتماد إعدادات الجلسة (`request.payment_review` / `request.enrollment_write`)
- **المشكلة:** إعدادات قابلة للضبط من المتصل لا تصلح كحد أمني كافٍ.
- **الإصلاح:** حذف سياسات/استدعاءات GUC. الكتابة الحساسة تعتمد على:
  - سحب `GRANT` للكتابة عن `authenticated`
  - دوال `SECURITY DEFINER` مملوكة لـ `postgres`
  - تحقّق داخلي بـ `is_super_admin()` / `service_role`
  - trigger عدم قابلية تعديل طلبات الدفع بصيغة `SECURITY INVOKER` يميز سياق DEFINER عبر `current_user <> session_user`

### 3) حماية تحقق الهاتف
- تغيير `phone_number` يصفّر `phone_verified_at`.
- تعيين `phone_verified_at` إلى قيمة غير NULL محظور على الطالب/المدرّس.
- دالة الحماية أصبحت `SECURITY INVOKER` حتى لا تُفرَّغ تلقائيًا.

### 4) سير الدفع/التسجيل
- الموافقة/الرفض/التعليق عبر RPCs فقط.
- تثبيت `OWNER TO postgres` للدوال الحساسة وعرض الكتالوج.
- منع `provision_super_admin` عن `anon/authenticated`.

## الاختبارات الآلية

- الملف: `supabase/tests/security_suite.sql`
- الدليل: [`security-test-guide.md`](./security-test-guide.md)
- الأمر: `npm run test:security`
- يعتمد الآن على **`SET LOCAL ROLE`** الحقيقي (`anon` / `authenticated` / `service_role`) مع التحقق من `current_user` ورفض أدوار `BYPASSRLS`.
- المتغيرات مسبوقة بـ `v_` والجداول بأسماء مستعارة صريحة لتفادي الغموض.

### نتيجة التشغيل في هذه الجلسة

```text
RESULT=skipped
CODE=no_local_database أو psql_missing
```

**لا يُدَّعى نجاح الاختبارات.** المتبقي غير المثبت تشغيليًا موثّق في مخرجات المشغّل تحت `UNTESTED=`.

## مخاطر متبقية

1. اعتماد تمييز سياق DEFINER على أسماء الأدوار `postgres`/`supabase_admin` — يجب التحقق من مالك الدوال بعد التطبيق الفعلي.
2. `FORCE RLS` مع مالك غير superuser قد يكسر RPCs إن تغيّرت ملكية الدوال.
3. إدراج `auth.users` داخل Suite قد يحتاج توافقًا مع إصدار Auth المحلي.
4. اختبار التزامن الحقيقي (parallel sessions) غير مغطى بالكامل في الـ suite الحالية.
5. الهجرات ما زالت غير مطبّقة عن بُعد — أي اختلاف بيئة يظهر فقط عند التطبيق اليدوي الموافق عليه.
