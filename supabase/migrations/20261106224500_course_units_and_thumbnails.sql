-- =============================================================================
-- 20261106224500_course_units_and_thumbnails.sql
-- نموذج العمل: الترم الدراسي -> وحدة مشتراة (courses) -> أقسام مخصّصة (course_semesters)
--
-- لا تُطبَّق على الإنتاج إلا بعد موافقة صريحة.
-- لا حذف للجداول ولا لشراء الترم القديم للحفاظ على التسجيلات القديمة.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'academic_semester'
  ) THEN
    CREATE TYPE public.academic_semester AS ENUM ('first', 'second');
  END IF;
END
$$;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS academic_semester public.academic_semester;

COMMENT ON COLUMN public.courses.academic_semester IS
  'الترم الدراسي التنظيمي (أول / ثانٍ). الوحدة المشتراة هي صف courses نفسه.';

COMMENT ON TABLE public.course_semesters IS
  'أقسام محتوى داخل الوحدة. ليست منتجات شراء منفصلة.';

CREATE INDEX IF NOT EXISTS courses_academic_semester_idx
  ON public.courses (academic_semester);

-- سلة صور الغلاف: قراءة عامة للعرض، الكتابة للمالك فقط
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-thumbnails',
  'course-thumbnails',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS course_thumbnails_public_read ON storage.objects;
CREATE POLICY course_thumbnails_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'course-thumbnails');

DROP POLICY IF EXISTS course_thumbnails_admin_insert ON storage.objects;
CREATE POLICY course_thumbnails_admin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-thumbnails'
    AND public.is_super_admin()
  );

DROP POLICY IF EXISTS course_thumbnails_admin_update ON storage.objects;
CREATE POLICY course_thumbnails_admin_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'course-thumbnails'
    AND public.is_super_admin()
  )
  WITH CHECK (
    bucket_id = 'course-thumbnails'
    AND public.is_super_admin()
  );

DROP POLICY IF EXISTS course_thumbnails_admin_delete ON storage.objects;
CREATE POLICY course_thumbnails_admin_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'course-thumbnails'
    AND public.is_super_admin()
  );
