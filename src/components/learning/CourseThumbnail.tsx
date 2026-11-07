import Image from "next/image";
import { courseThumbnailPublicUrl } from "@/lib/learning/thumbnail";

type CourseThumbnailProps = {
  title: string;
  thumbnailPath?: string | null;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

export function CourseThumbnail({
  title,
  thumbnailPath,
  className = "",
  sizes = "(max-width: 768px) 100vw, 320px",
  priority = false,
}: CourseThumbnailProps) {
  const src = courseThumbnailPublicUrl(thumbnailPath);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#1a1228] ${className}`}
    >
      {src ? (
        <Image
          src={src}
          alt={title}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(124,58,237,0.35),transparent_55%),linear-gradient(160deg,#1a1228,#0b0913)]">
          <span className="px-3 text-center text-xs font-medium text-white/55">
            بدون صورة غلاف
          </span>
        </div>
      )}
    </div>
  );
}
