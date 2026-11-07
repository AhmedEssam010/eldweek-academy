# المرحلة 06 — إدارة المحتوى والدروس والفيديو المحمي وامتحانات MCQ

## التسلسل الهرمي

```
كورس
 └── ترمات (course_semesters)
      └── دروس (lessons)
           ├── محتوى فيديو (video_asset_id خاص — عبر تفويض خادمي)
           └── امتحان اختياري (exams مرتبط بدرس أو ترم)
```

أمثلة تسمية فقط (ليست سجلات قاعدة): البرمجة للمبتدئين · الذكاء الاصطناعي · أساسيات Python.

## المسارات الجديدة

### المالك `/admin/courses/[id]/…`
- `semesters` · `semesters/new` · `semesters/[semesterId]`
- `lessons/[lessonId]`
- `exams` · `exams/new` · `exams/[examId]`
- `progress`

### المدرّس `/teacher/courses/[id]/…`
- نفس هيكل المحتوى مع فحوصات `can_edit_content` / `can_manage_exams` / `can_view_student_progress` على الخادم
- لا يُستنتج الوصول من `created_by`

### الطالب
- `/student/courses` · `/student/courses/[id]`
- `/student/lessons/[id]`
- `/student/exams/[id]`
- `/student/results`

## المكوّنات المشتركة (`src/components/learning/`)

| المكوّن | الدور |
|---|---|
| `CourseContentLayout` | تبويب إدارة المحتوى حسب الصلاحيات |
| `SemesterList` / `LessonList` | قوائم عربية RTL |
| `LessonEditor` | نماذج درس (كتابة معطّلة) |
| `LessonVideoPlayer` | واجهة تشغيل + تنقّل + حالات قفل/تحميل |
| `LockedLessonState` | محتوى مقفل بصدق |
| `ExamEditor` / `QuestionEditor` | مسودات MCQ مع مفتاح صحيح في واجهة الطاقم فقط |
| `ExamTakingInterface` / `ExamTimer` | أداء الامتحان + مؤقّت عرضي |
| `ExamResultCard` / `LearningProgress` | نتائج وتقدّم |

## نموذج أمان تشغيل الفيديو

1. لا تُعرَض `video_asset_id` في قوائم عامة أو حزم عميل للدروس المدفوعة.
2. التفويض عبر `authorizeLessonPlayback` → RPC `get_lesson_playback_grant` على الخادم.
3. يُتحقق من استحقاق الطالب النشط (كورس كامل أو ترم) وحالة النشر؛ التسجيلات الموقوفة/المنتهية تُرفض.
4. الاستجابة للواجهة: حالة تفويض + `playbackUrl` موقّت (حاليًا `null` حتى ربط مزوّد).
5. لا `service_role` في المتصفح.
6. لا ادّعاء DRM أو منع تنزيل كامل؛ الحماية ليست «client-only».

## بنية امتحانات MCQ (هجرات محلية جديدة)

- `20261101220013_exams.sql` — الجداول والقيود
- `20261101220014_exams_rls_and_grading.sql` — RLS + عرض `exam_options_for_taking` بدون `is_correct` + `start_exam_attempt` / `submit_exam_attempt`

### قواعد أمان التقويم
- الطلاب لا يقرأون `is_correct` قبل التسليم (عرض آمن + سياسات).
- التقويم داخل دالة SECURITY DEFINER على ساعة الخادم.
- التحقق أن الخيار يخص السؤال والسؤال يخص الامتحان.
- حدود المحاولات والمدة والحالة تُفرض على الخادم.
- لا إدراج درجات أو أعلام صحة من العميل.
- مؤقّت الواجهة عرضي؛ الحسم النهائي عند التسليم على الخادم.

**لم تُطبَّق هذه الهجرات عن بُعد.**

## فحوصات الاستحقاق للطالب

- دوال موجودة مسبقًا: `student_has_active_enrollment_for_course|semester|lesson`
- جديدة: `student_has_active_enrollment_for_exam`
- واجهات الطالب تفشل مغلقًا ولا تختلق مشتريات أو درجات

## ما هو منفّذ الآن

- واجهات عربية RTL لإدارة الترمات/الدروس/الامتحانات (مالك ومدرّس)
- تجربة طالب: كورساتي، درس فيديو، امتحان، نتائج
- طبقة بيانات خادم تفشل عند `NEXT_PUBLIC_DB_SCHEMA_READY=false`
- كتابات المحتوى/التقدّم/التسليم **معطّلة عمدًا** عبر `src/lib/learning/mutations.ts`
- توثيق هذا الملف + أنواع TypeScript للجداول الجديدة

## ما يبقى معطّلًا حتى جاهزية الخلفية

- تطبيق الهجرات عن بُعد (بما فيها exams)
- أي mutation حقيقية أو رفع فيديو أو إنشاء buckets
- روابط تشغيل موقّتة من مزوّد حقيقي
- بدء/تسليم امتحان فعلي وكتابة `lesson_progress`
- اختبارات `security_suite` على قاعدة حية (ما زالت غير منفّذة بنجاح سابقًا)
- المرحلة 07 والدفع/النشر

## اختبارات مطلوبة لاحقًا (بعد موافقة)

1. قاعدة disposable + تطبيق كل الهجرات محليًا.
2. توسيع `security_suite` لـ exams: منع قراءة المفتاح، حدود المحاولات، الاستحقاق.
3. تجربة تفويض فيديو لطالب مستحق وغير مستحق.
4. ضبط بوابات الجاهزية فقط بعد النجاح.
