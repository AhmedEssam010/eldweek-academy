-- =============================================================================
-- 20261111120000_course_pdf_materials.sql
-- ملفات PDF تعليمية داخل أقسام الكورس + سلة Storage خاصة
-- لا تُطبَّق على الإنتاج إلا يدويًا بعد مراجعة المالك.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  semester_id uuid NOT NULL REFERENCES public.course_semesters (id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  file_size_bytes bigint NOT NULL,
  original_filename text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_materials_title_len_chk
    CHECK (char_length(btrim(title)) >= 2 AND char_length(title) <= 200),
  CONSTRAINT course_materials_description_len_chk
    CHECK (char_length(description) <= 4000),
  CONSTRAINT course_materials_file_size_chk
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 52428800),
  CONSTRAINT course_materials_path_safe_chk
    CHECK (
      storage_path !~ '\.\.'
      AND storage_path !~ '^/'
      AND storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    ),
  CONSTRAINT course_materials_filename_len_chk
    CHECK (char_length(original_filename) <= 255)
);

COMMENT ON TABLE public.course_materials IS
  'مواد PDF تعليمية مرتبطة بقسم (course_semesters) داخل كورس. المسار في سلة course-materials الخاصة.';

CREATE UNIQUE INDEX IF NOT EXISTS course_materials_storage_path_uidx
  ON public.course_materials (storage_path);

CREATE INDEX IF NOT EXISTS course_materials_semester_sort_idx
  ON public.course_materials (semester_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS course_materials_course_published_idx
  ON public.course_materials (course_id, is_published);

DROP TRIGGER IF EXISTS trg_course_materials_set_updated_at ON public.course_materials;
CREATE TRIGGER trg_course_materials_set_updated_at
  BEFORE UPDATE ON public.course_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ضمان انتماء القسم للكورس عند الإدراج/التحديث
CREATE OR REPLACE FUNCTION public.course_materials_enforce_semester_course()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_course uuid;
BEGIN
  SELECT s.course_id INTO v_course
  FROM public.course_semesters AS s
  WHERE s.id = NEW.semester_id;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'course_material_semester_not_found' USING ERRCODE = '23503';
  END IF;

  IF NEW.course_id IS DISTINCT FROM v_course THEN
    RAISE EXCEPTION 'course_material_semester_mismatch' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_materials_enforce_semester ON public.course_materials;
CREATE TRIGGER trg_course_materials_enforce_semester
  BEFORE INSERT OR UPDATE OF course_id, semester_id
  ON public.course_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.course_materials_enforce_semester_course();

ALTER FUNCTION public.course_materials_enforce_semester_course() OWNER TO postgres;

ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials FORCE ROW LEVEL SECURITY;

-- قراءة: المالك/المحرّر يرى الكل؛ الطالب المشترك يرى المنشور فقط
DROP POLICY IF EXISTS course_materials_staff_or_admin_read ON public.course_materials;
CREATE POLICY course_materials_staff_or_admin_read
  ON public.course_materials
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, true, false, false)
  );

DROP POLICY IF EXISTS course_materials_enrolled_published_read ON public.course_materials;
CREATE POLICY course_materials_enrolled_published_read
  ON public.course_materials
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND public.student_has_active_enrollment_for_course(course_id)
  );

-- كتالوج عام: عناوين المواد المنشورة في كورس منشور (بدون مسار التخزين)
DROP POLICY IF EXISTS course_materials_public_title_published ON public.course_materials;
CREATE POLICY course_materials_public_title_published
  ON public.course_materials
  FOR SELECT
  TO authenticated, anon
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1
      FROM public.courses AS c
      WHERE c.id = course_materials.course_id
        AND c.status = 'published'
    )
  );

DROP POLICY IF EXISTS course_materials_write_admin_or_editor ON public.course_materials;
CREATE POLICY course_materials_write_admin_or_editor
  ON public.course_materials
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, true, false, false)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.teacher_has_course_permission(course_id, true, false, false)
  );

REVOKE ALL ON TABLE public.course_materials FROM PUBLIC;
REVOKE ALL ON TABLE public.course_materials FROM anon;
REVOKE ALL ON TABLE public.course_materials FROM authenticated;

-- العنوان والوصف والحجم للجميع المصرّح؛ مسار التخزين للموظفين فقط عبر عميل الخادم الموثوق
-- ملاحظة: سياسات RLS تتحكم في الصفوف؛ المنح التالية تمنع anon من storage_path عبر SELECT عام.
-- بدون storage_path لـ authenticated/anon — المسار يُقرأ عبر service_role بعد التحقق من الصلاحية
GRANT SELECT (
  id,
  course_id,
  semester_id,
  title,
  description,
  file_size_bytes,
  original_filename,
  sort_order,
  is_published,
  created_at,
  updated_at
) ON public.course_materials TO anon, authenticated;

GRANT INSERT (
  id,
  course_id,
  semester_id,
  title,
  description,
  storage_path,
  file_size_bytes,
  original_filename,
  sort_order,
  is_published,
  created_by
) ON public.course_materials TO authenticated;

GRANT UPDATE (
  title,
  description,
  storage_path,
  file_size_bytes,
  original_filename,
  sort_order,
  is_published
) ON public.course_materials TO authenticated;

GRANT DELETE ON public.course_materials TO authenticated;
GRANT ALL ON TABLE public.course_materials TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Storage: سلة خاصة لملفات PDF (50MB)
-- المسار: {course_id}/{semester_id}/{uuid}.pdf
-- الطلاب لا يقرأون الكائنات مباشرة — الروابط الموقّعة تُنشأ من الخادم فقط.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-materials',
  'course-materials',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS course_materials_storage_select ON storage.objects;
CREATE POLICY course_materials_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'course-materials'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND (
      public.is_super_admin()
      OR public.teacher_has_course_permission(
        ((storage.foldername(name))[1])::uuid,
        true,
        false,
        false
      )
    )
  );

DROP POLICY IF EXISTS course_materials_storage_insert ON storage.objects;
CREATE POLICY course_materials_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-materials'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND (
      public.is_super_admin()
      OR public.teacher_has_course_permission(
        ((storage.foldername(name))[1])::uuid,
        true,
        false,
        false
      )
    )
  );

DROP POLICY IF EXISTS course_materials_storage_update ON storage.objects;
CREATE POLICY course_materials_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'course-materials'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND (
      public.is_super_admin()
      OR public.teacher_has_course_permission(
        ((storage.foldername(name))[1])::uuid,
        true,
        false,
        false
      )
    )
  )
  WITH CHECK (
    bucket_id = 'course-materials'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND (
      public.is_super_admin()
      OR public.teacher_has_course_permission(
        ((storage.foldername(name))[1])::uuid,
        true,
        false,
        false
      )
    )
  );

DROP POLICY IF EXISTS course_materials_storage_delete ON storage.objects;
CREATE POLICY course_materials_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'course-materials'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND (
      public.is_super_admin()
      OR public.teacher_has_course_permission(
        ((storage.foldername(name))[1])::uuid,
        true,
        false,
        false
      )
    )
  );
