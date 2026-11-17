import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { VideoLibraryManager } from "@/components/learning/VideoLibraryManager";
import { requireTeacher } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { getMuxReadiness } from "@/lib/learning/mux";
import { listVideoLibrary } from "@/lib/learning/video-library";

export const metadata = {
  title: "مكتبة الفيديو | لوحة المدرّس",
};

export const instant = false;

export default async function TeacherVideoLibraryPage() {
  await requireTeacher();
  const readiness = getAuthReadiness();
  const mux = getMuxReadiness();

  if (!readiness.dbSchemaReady) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="مكتبة الفيديو"
          description="ارفع فيديوهات المنصة وشاهد حالتها. الحذف وإدارة الكورسات متاحان للمالك فقط."
        />
        <SetupRequiredPanel message="قاعدة البيانات غير جاهزة بعد." />
      </div>
    );
  }

  let items: Awaited<ReturnType<typeof listVideoLibrary>> = [];
  let loadError: string | null = null;
  try {
    items = await listVideoLibrary();
  } catch {
    loadError =
      "تعذر قراءة المكتبة. إن لم تُطبَّق هجرة video_assets بعد، راجع المالك.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مكتبة الفيديو"
        description="يمكنك رفع فيديوهات جديدة ومتابعة حالتها ومشاهدتها في القائمة. لا يمكنك حذف الفيديوهات — ذلك للمالك فقط، وستظهر رفعاتك في مكتبته فورًا."
      />
      {!mux.ready ? (
        <SetupRequiredPanel
          message={`مفاتيح Mux غير مكتملة: ${mux.missing.join("، ")}`}
        />
      ) : null}
      <VideoLibraryManager
        items={items}
        muxReady={mux.ready}
        loadError={loadError}
        capabilities={{
          canUpload: true,
          canRename: false,
          canDelete: false,
        }}
      />
    </div>
  );
}
