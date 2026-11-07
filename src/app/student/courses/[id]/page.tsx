import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/guards";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentCourseDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  await requireStudent({ nextPath: `/courses/${id}` });
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/courses/${id}${suffix}`);
}