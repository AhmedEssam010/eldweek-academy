-- =============================================================================
-- 20261109150000_payment_receipt_images.sql
-- سلة خاصة لصور إثبات التحويل + سياسات Storage
-- لا تُطبَّق على الإنتاج إلا بعد موافقة صريحة.
-- عمود payment_requests.receipt_path موجود مسبقًا ويُعاد استخدامه لمسار الملف.
-- الطلبات القديمة التي خزّنت رقم العملية كنص تبقى كما هي.
-- =============================================================================


COMMENT ON COLUMN public.payment_requests.receipt_path IS
  'مسار صورة إثبات التحويل في سلة payment-receipts (الطلبات الجديدة)، أو مرجع نصي قديم لرقم العملية (التوافق التاريخي).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- قراءة: الطالب لمجلدّه فقط، أو المالك
DROP POLICY IF EXISTS payment_receipts_select ON storage.objects;
CREATE POLICY payment_receipts_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    )
  );

-- رفع: داخل مجلد المستخدم فقط
DROP POLICY IF EXISTS payment_receipts_insert ON storage.objects;
CREATE POLICY payment_receipts_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

-- حذف: لتنظيف الرفع عند فشل إنشاء الطلب — مجلد المستخدم أو المالك
DROP POLICY IF EXISTS payment_receipts_delete ON storage.objects;
CREATE POLICY payment_receipts_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    )
  );

-- لا UPDATE — الإيصالات غير قابلة للاستبدال بعد الرفع
DROP POLICY IF EXISTS payment_receipts_update ON storage.objects;


