import { redirect } from "next/navigation";

/**
 * دور المدرّس الحالي مقصور على مكتبة الفيديو.
 * أي مسار تحت /teacher/courses يُعاد توجيهه للمكتبة.
 */
export default function TeacherCoursesBlockedLayout({
  children: _children,
}: {
  children: React.ReactNode;
}) {
  redirect("/teacher/video-library");
}
