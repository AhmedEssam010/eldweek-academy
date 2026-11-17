-- DRAFT ONLY — لا تُطبَّق على الإنتاج دون موافقة صريحة.
-- الفجوة: create_course_draft يضبط created_by لكن لا يُنشئ course_staff_assignments،
-- بينما تعديل المحتوى وارسال pending_review يعتمدان على التعيين (can_edit_content).
-- الحل المؤقت في التطبيق: service_role upsert بعد إنشاء مسودة المدرّس.
-- هذا الملف يجعل التعيين ذريًا داخل RPC عند موافقة الهجرة.

CREATE OR REPLACE FUNCTION public.create_course_draft(
  p_title text,
  p_slug text,
  p_description text DEFAULT '',
  p_thumbnail_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_course_id uuid;
  actor uuid := (SELECT auth.uid());
  actor_role public.user_role;
BEGIN
  IF NOT public.can_create_course_drafts() THEN
    RAISE EXCEPTION 'not_allowed_to_create_course_draft'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.courses (
    title,
    slug,
    description,
    thumbnail_path,
    created_by,
    status
  )
  VALUES (
    trim(p_title),
    lower(trim(p_slug)),
    COALESCE(p_description, ''),
    p_thumbnail_path,
    actor,
    'draft'
  )
  RETURNING id INTO new_course_id;

  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = actor;

  IF actor_role = 'teacher' THEN
    INSERT INTO public.course_staff_assignments (
      course_id,
      teacher_id,
      can_edit_content,
      can_manage_exams,
      can_view_student_progress
    )
    VALUES (
      new_course_id,
      actor,
      true,
      false,
      false
    )
    ON CONFLICT (course_id, teacher_id) DO UPDATE
      SET can_edit_content = true;
  END IF;

  RETURN new_course_id;
END;
$$;

COMMENT ON FUNCTION public.create_course_draft(text, text, text, text) IS
  'Creates a draft course; teachers with can_create_course_drafts also receive a content-edit staff assignment.';
