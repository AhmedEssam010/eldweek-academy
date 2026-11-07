-- =============================================================================
-- 20261101220004_courses_and_staff.sql
-- الكورسات وتعيينات فريق التدريس — الصلاحيات لا تُستنتج من created_by وحده
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  thumbnail_path text,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status public.course_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT courses_title_not_blank_chk CHECK (length(trim(title)) > 0),
  CONSTRAINT courses_slug_format_chk CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS courses_slug_unique_idx ON public.courses (slug);
CREATE INDEX IF NOT EXISTS courses_status_idx ON public.courses (status);
CREATE INDEX IF NOT EXISTS courses_created_by_idx ON public.courses (created_by);

DROP TRIGGER IF EXISTS trg_courses_set_updated_at ON public.courses;
CREATE TRIGGER trg_courses_set_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.course_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  can_edit_content boolean NOT NULL DEFAULT false,
  can_manage_exams boolean NOT NULL DEFAULT false,
  can_view_student_progress boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_staff_assignments_unique UNIQUE (course_id, teacher_id),
  CONSTRAINT course_staff_assignments_has_scope_chk CHECK (
    can_edit_content OR can_manage_exams OR can_view_student_progress
  )
);

CREATE INDEX IF NOT EXISTS course_staff_assignments_teacher_idx
  ON public.course_staff_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS course_staff_assignments_course_idx
  ON public.course_staff_assignments (course_id);

-- التأكد أن teacher_id يخص مدرّسًا نشطًا (أو يمكن تعيينه قبل تفعيل دوره عبر workflow)
CREATE OR REPLACE FUNCTION public.enforce_staff_assignment_teacher_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = NEW.teacher_id
      AND p.role = 'teacher'
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'staff_assignment_requires_active_teacher'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_staff_assignment_teacher_role() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_staff_assignment_teacher_role
  ON public.course_staff_assignments;
CREATE TRIGGER trg_enforce_staff_assignment_teacher_role
  BEFORE INSERT OR UPDATE OF teacher_id ON public.course_staff_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_staff_assignment_teacher_role();

-- حماية حالات النشر/الأرشفة
CREATE OR REPLACE FUNCTION public.protect_course_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := COALESCE(auth.jwt() ->> 'role', '');

  IF jwt_role = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'pending_review') THEN
      RAISE EXCEPTION 'teachers_may_only_create_draft_or_pending_courses'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('published', 'archived')
       OR OLD.status IN ('published', 'archived') THEN
      RAISE EXCEPTION 'only_super_admin_may_publish_or_archive_courses'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_course_status_transitions() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_course_status_transitions ON public.courses;
CREATE TRIGGER trg_protect_course_status_transitions
  BEFORE INSERT OR UPDATE OF status ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_course_status_transitions();

-- دوال صلاحيات الكورس (بدون تكرار RLS)
CREATE OR REPLACE FUNCTION public.teacher_has_course_permission(
  p_course_id uuid,
  p_need_edit_content boolean DEFAULT false,
  p_need_manage_exams boolean DEFAULT false,
  p_need_view_progress boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.course_staff_assignments AS a
      INNER JOIN public.profiles AS p ON p.id = a.teacher_id
      WHERE a.course_id = p_course_id
        AND a.teacher_id = (SELECT auth.uid())
        AND p.role = 'teacher'
        AND p.is_active = true
        AND (NOT p_need_edit_content OR a.can_edit_content = true)
        AND (NOT p_need_manage_exams OR a.can_manage_exams = true)
        AND (NOT p_need_view_progress OR a.can_view_student_progress = true)
    );
$$;

REVOKE ALL ON FUNCTION public.teacher_has_course_permission(uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_has_course_permission(uuid, boolean, boolean, boolean)
  TO authenticated, service_role;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.course_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_staff_assignments FORCE ROW LEVEL SECURITY;
