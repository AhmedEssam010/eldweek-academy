# خطة تزويد حساب المالك (super_admin)

راجع أيضًا: `docs/auth/phase-07.md`.

## القواعد

- التسجيل العام **دائمًا** ينشئ `student` عبر `handle_new_user`.
- **لا** يُسمح بتمرير دور مرتفع عبر `raw_user_meta_data`.
- يوجد قيد فهرس جزئي يسمح بـ **super_admin واحد فقط**.
- ترقية المالك تتم خارج التسجيل العام عبر `service_role` فقط.
- `admin_set_user_role` يرفض ترقية إلى `super_admin`.

## الفحص قبل التزويد

```bash
node scripts/check-owner-status.mjs
# أو
npx supabase db query --remote --read-only --file scripts/check-owner-status.sql --output-format json
```

يجب أن يكون `super_admin_count = 0` قبل الإنشاء.

## الإجراء الآمن (سكربت محلي لمرة واحدة)

1. تحقق يدويًا من Auth → Phone في لوحة Supabase.
2. ضع `SUPABASE_SERVICE_ROLE_KEY` في بيئة الطرفية فقط (ليس في Git، ليس `NEXT_PUBLIC_*`).
3. جافٍ أولًا:

```bash
node scripts/provision-owner.mjs
```

4. بعد موافقة صريحة ورقم الهاتف:

```bash
# في الطرفية فقط — لا تلصق الأسرار في الدردشة
$env:APPROVE_OWNER_PROVISION="yes"
$env:OWNER_PHONE="+20XXXXXXXXXX"
$env:OWNER_PASSWORD="(كلمة مرور قوية تختارها)"
$env:SUPABASE_SERVICE_ROLE_KEY="(من لوحة Supabase)"
node scripts/provision-owner.mjs --execute
```

5. التحقق: `super_admin_count = 1` دون طباعة بيانات شخصية.
6. دوّر `service_role` إن عُرض في مكان غير آمن.

## دعوة المدرّسين

1. المالك ينشئ حساب المدرّس (أو مسار دعوة لاحقًا).
2. يستدعي `admin_set_user_role(user_id, 'teacher', true, can_create_course_drafts)`.
3. يعيّن الكورسات عبر `upsert_course_staff_assignment`.

## ما هو متعمّدًا غير متاح

- ترقية أي مستخدم إلى `super_admin` عبر `admin_set_user_role`.
- إنشاء مالك ثانٍ عند وجود مالك حالي.
- اختيار `super_admin` / `teacher` من واجهة التسجيل العامة.
