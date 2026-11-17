/**
 * قواعد كلمة مرور حساب المدرّس (أقوى من تسجيل الطلاب العام).
 * مشتركة بين الإجراءات والاختبارات — لا تُطبع القيم أبدًا.
 */
export function validateTeacherPassword(password: string): string | null {
  if (password.length < 12) {
    return "كلمة المرور يجب ألا تقل عن 12 حرفًا.";
  }
  if (!/[A-Za-z\u0600-\u06FF]/.test(password) || !/[0-9]/.test(password)) {
    return "كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل.";
  }
  return null;
}
