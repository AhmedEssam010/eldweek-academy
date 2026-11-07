# هندسة قاعدة البيانات — منصة المهندس أحمد الدويك

هذه المرحلة تُحضّر مخطط PostgreSQL/Supabase محليًا فقط.  
**لم يتم تطبيق الهجرات على قاعدة Supabase البعيدة.**

## نموذج العمل

- منصة تعليمية عربية بمالك واحد: **المهندس أحمد الدويك** (`super_admin`).
- المدرّسون فريق داخلي يعيّنهم المالك على كورسات محددة.
- ليست سوقًا عامًا متعدد المدرّسين وليست SaaS متعدد المستأجرين.

## ملفات الهجرة

المسار: `supabase/migrations/`

| الملف | المحتوى |
|---|---|
| `20261101220001_extensions_and_enums.sql` | التعدادات |
| `20261101220002_utility_triggers.sql` | `updated_at` |
| `20261101220003_profiles.sql` | الملفات، دور واحد للمالك، حماية الأدوار |
| `20261101220004_courses_and_staff.sql` | الكورسات وتعيينات الفريق |
| `20261101220005_semesters_and_lessons.sql` | الترمات والدروس + `lessons_catalog` |
| `20261101220006_products.sql` | المنتجات والأسعار |
| `20261101220007_payments_and_enrollments.sql` | الدفع والتسجيلات |
| `20261101220008_lesson_progress.sql` | تقدم الدروس |
| `20261101220009_audit_logs.sql` | سجل التدقيق |
| `20261101220010_rls_policies.sql` | سياسات RLS |
| `20261101220011_secure_workflows.sql` | دوال سير العمل الآمن |
| `20261101220012_column_privileges_and_grants.sql` | صلاحيات الأعمدة والمنح |

## شرح العلاقات (عربي)

```text
auth.users 1──1 profiles
profiles (teacher) 1──* course_staff_assignments *──1 courses
profiles (creator) 1──* courses.created_by
courses 1──* course_semesters 1──* lessons
courses 1──* products (full_course)
course_semesters 1──* products (semester)
profiles (student) 1──* payment_requests *──1 products
profiles (student) 1──* enrollments *──1 products
payment_requests 1──0..1 enrollments (عبر الموافقة)
profiles (student) 1──* lesson_progress *──1 lessons
```

### ملخص قواعد العلاقات

1. **profiles**: مرتبط بحساب `auth.users`. التسجيل العام ينشئ دور `student` فقط.
2. **courses**: الملكية الإدارية للمالك. `created_by` للتتبع ولا يكفي وحده لمنح صلاحيات التدريس.
3. **course_staff_assignments**: مصدر الحقيقة لصلاحيات المدرّس على كورس معيّن.
4. **course_semesters / lessons**: هيكل المحتوى. `video_asset_id` محمي عبر صلاحيات الأعمدة + دالة التشغيل.
5. **products**: إما كورس كامل أو ترم واحد (قيد CHECK).
6. **payment_requests**: الطالب يطلب؛ المبلغ يُفرَض من سعر المنتج في قاعدة البيانات.
7. **enrollments**: تُنشأ فقط عبر موافقة الدفع أو سير عمل إداري آمن.
8. **lesson_progress**: يخص الطالب نفسه ويتطلب استحقاق وصول ساريًا.
9. **audit_logs**: يُكتب من دوال السيرفر/قاعدة البيانات فقط.

## الوثائق التفصيلية

- [مصفوفة الأدوار والصلاحيات](./roles-permissions-matrix.md)
- [تصميم موافقة الدفع](./payment-approval-design.md)
- [خطة تزويد المالك](./admin-provisioning.md)
- [خطة تخزين الإيصالات](./receipt-storage-plan.md)
- [قائمة مراجعة أمنية](./security-checklist.md)
- [إصلاحات المراجعة الأمنية](./security-review-fixes.md)
- [تعليمات تطبيق الهجرة يدويًا](./migration-instructions.md)
- [قرارات معلّقة ومخاطر](./unresolved-decisions.md)

## اختبارات أمنية محلية

راجع: [دليل اختبارات الأمان](./security-test-guide.md)

```bash
npm run test:security
```

يتطلب قاعدة LOCAL/disposable و`psql` وتبديل أدوار حقيقي. لا يُشغَّل ضد الإنتاج.
