/**
 * تجميع وتحقق أجزاء الاسم الرباعي قبل حفظ full_name.
 */

export type NameParts = {
  firstName: string;
  secondName: string;
  thirdName: string;
  lastName: string;
};

const LABELS: Array<{ key: keyof NameParts; label: string }> = [
  { key: "firstName", label: "الاسم الأول" },
  { key: "secondName", label: "الاسم الثاني" },
  { key: "thirdName", label: "الاسم الثالث" },
  { key: "lastName", label: "الاسم الأخير" },
];

export function readNameParts(formData: FormData): NameParts {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    secondName: String(formData.get("secondName") ?? ""),
    thirdName: String(formData.get("thirdName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
  };
}

/** يفكّك full_name إلى أربعة حقول للعرض في نموذج التعديل. */
export function splitFullNameParts(fullName: string): NameParts {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    secondName: parts[1] ?? "",
    thirdName: parts[2] ?? "",
    lastName: parts.length > 3 ? parts.slice(3).join(" ") : (parts[3] ?? ""),
  };
}

export function validateAndCombineFullName(
  parts: NameParts,
): { ok: true; fullName: string } | { ok: false; message: string } {
  const trimmed: string[] = [];

  for (const { key, label } of LABELS) {
    const value = parts[key].trim();
    if (!value) {
      return { ok: false, message: `يرجى إدخال ${label}.` };
    }
    if (/^\d+$/.test(value)) {
      return {
        ok: false,
        message: `${label} لا يمكن أن يكون أرقامًا فقط.`,
      };
    }
    if (!/[\p{L}\p{M}]/u.test(value)) {
      return {
        ok: false,
        message: `${label} يجب أن يحتوي على حروف صالحة.`,
      };
    }
    trimmed.push(value);
  }

  return {
    ok: true,
    fullName: trimmed.join(" "),
  };
}
