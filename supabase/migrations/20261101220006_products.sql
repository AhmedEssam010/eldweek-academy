-- =============================================================================
-- 20261101220006_products.sql
-- المنتجات والأسعار — إدارة حصرية لـ super_admin
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type public.product_type NOT NULL,
  course_id uuid REFERENCES public.courses (id) ON DELETE RESTRICT,
  semester_id uuid REFERENCES public.course_semesters (id) ON DELETE RESTRICT,
  price_egp numeric(12, 2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT products_price_nonnegative_chk CHECK (price_egp >= 0),
  CONSTRAINT products_exactly_one_target_chk CHECK (
    (
      product_type = 'full_course'
      AND course_id IS NOT NULL
      AND semester_id IS NULL
    )
    OR (
      product_type = 'semester'
      AND semester_id IS NOT NULL
      AND course_id IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS products_course_id_idx ON public.products (course_id);
CREATE INDEX IF NOT EXISTS products_semester_id_idx ON public.products (semester_id);
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products (is_active);

-- منتج واحد نشط لكل هدف (كورس كامل أو ترم)
CREATE UNIQUE INDEX IF NOT EXISTS products_one_active_full_course_idx
  ON public.products (course_id)
  WHERE is_active = true AND product_type = 'full_course';

CREATE UNIQUE INDEX IF NOT EXISTS products_one_active_semester_idx
  ON public.products (semester_id)
  WHERE is_active = true AND product_type = 'semester';

DROP TRIGGER IF EXISTS trg_products_set_updated_at ON public.products;
CREATE TRIGGER trg_products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- التحقق أن الترم ينتمي لكورس موجود عند نوع semester (الاتساق المرجعي المنطقي)
CREATE OR REPLACE FUNCTION public.enforce_product_target_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.product_type = 'semester' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.course_semesters AS s WHERE s.id = NEW.semester_id
    ) THEN
      RAISE EXCEPTION 'product_semester_not_found' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW.product_type = 'full_course' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.courses AS c WHERE c.id = NEW.course_id
    ) THEN
      RAISE EXCEPTION 'product_course_not_found' USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_target_consistency() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_product_target_consistency ON public.products;
CREATE TRIGGER trg_enforce_product_target_consistency
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_target_consistency();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
