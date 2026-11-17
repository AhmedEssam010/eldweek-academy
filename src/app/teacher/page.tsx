import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth/guards";

export const metadata = {
  title: "لوحة المدرّس | المهندس أحمد الدويك",
};

export const instant = false;

/** دور المدرّس مقصور على مكتبة الفيديو: رفع ومشاهدة فقط. */
export default async function TeacherHomePage() {
  await requireTeacher();
  redirect("/teacher/video-library");
}
