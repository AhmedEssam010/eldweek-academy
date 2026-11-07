# تصميم موافقة الدفع الآمن (مستقبلي)

## المبادئ

1. **لا ثقة بمبلغ العميل**: عمود `amount_egp` يُستبدل تلقائيًا بسعر `products.price_egp` عند الإنشاء.
2. **الطالب لا يعدّل الطلب بعد الإرسال**: trigger يمنع UPDATE لغير المالك/`service_role`.
3. **الموافقة معاملاتية**: الدالة `approve_payment_request` تستخدم `SELECT … FOR UPDATE`.
4. **منع التكرار**:
   - فهرس فريد لطلب `pending` لكل `(student_id, product_id)`.
   - فهرس فريد لتسجيل `active` لكل `(student_id, product_id)`.
   - إعادة استدعاء الموافقة لطلب `approved` تُعدّ عملية idempotent وتعيد `enrollment` الحالي.
5. **إعادة التحقق عند الموافقة**: مقارنة `amount_egp` بالسعر الحالي للمنتج قبل التفعيل.
6. **التدقيق**: كتابة `payment_approved` و`enrollment_activated` في `audit_logs`.

## التدفق المقترح في التطبيق (لم يُنفَّذ بعد)

```text
طالب يختار منتجًا نشطًا
  → يرفع إيصالًا إلى Storage خاص (مسار فقط في DB)
  → INSERT/RPC إنشاء payment_request (status=pending, amount من DB)
  → super_admin يراجع الإيصال عبر رابط موقّع مؤقت
  → RPC approve_payment_request أو reject_payment_request
  → عند الموافقة: تفعيل/تجديد enrollment داخل نفس المعاملة
```

## التجديد

إذا وُجد تسجيل `active` لنفس المنتج عند موافقة جديدة:

- يُحدَّث `expires_at` بالتمديد عند الحاجة.
- يُربط `payment_request_id` بآخر طلب موافق عليه.
- لا يُنشأ صف `active` مكرر.

## ما يبقى غير منفّذ في الواجهة

- شاشات الدفع والمراجعة.
- رفع الملفات إلى Storage.
- إشعارات الموافقة/الرفض.
