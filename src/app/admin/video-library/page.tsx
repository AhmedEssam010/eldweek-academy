import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupRequiredPanel } from "@/components/dashboard/SetupRequiredPanel";
import { VideoLibraryManager } from "@/components/learning/VideoLibraryManager";
import { requireAdmin } from "@/lib/auth/guards";
import { getAuthReadiness } from "@/lib/auth/readiness";
import { getMuxReadiness } from "@/lib/learning/mux";
import { listVideoLibrary } from "@/lib/learning/video-library";

export const instant = false;

export default async function AdminVideoLibraryPage() {
  await requireAdmin();
  const readiness = getAuthReadiness();
  const mux = getMuxReadiness();

  if (!readiness.dbSchemaReady) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="مكتبة الفيديو"
          description="رفع وإدارة فيديوهات Mux القابلة لإعادة الاستخدام عبر الدروس."
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
      "تعذر قراءة المكتبة. إن لم تُطبَّق هجرة video_assets بعد، طبّقها بموافقة المالك أولًا.";
  }

  if (items.length === 0 && !loadError) {
    // قد يعني الجدول غير موجود؛ listVideoLibrary يعيد [] بهدوء
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مكتبة الفيديو"
        description="مكتبة Mux المشتركة للمنصة. المدرّسون يمكنهم الرفع والمشاهدة فقط؛ الحذف وإعادة التسمية للمالك. كل ما يرفعه المدرّس يظهر هنا تلقائيًا."
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
          canRename: true,
          canDelete: true,
        }}
      />
    </div>
  );
}
