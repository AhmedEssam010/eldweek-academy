export type VideoAssetStatus = "uploading" | "processing" | "ready" | "failed";

export type VideoAsset = {
  id: string;
  title: string;
  mux_asset_id: string | null;
  mux_upload_id: string | null;
  mux_playback_id: string | null;
  status: VideoAssetStatus;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** صف مكتبة آمن للعرض في لوحة المالك / منتقي الدرس (بدون أسرار). */
export type VideoLibraryListItem = {
  id: string;
  title: string;
  status: VideoAssetStatus;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
  lessonCount: number;
  lessonTitles: string[];
};
