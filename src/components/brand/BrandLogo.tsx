import Image from "next/image";
import Link from "next/link";
import { SITE_LOGO_PATH, SITE_NAME } from "@/lib/data/navigation";

type BrandLogoSize = "sm" | "md" | "lg";

type BrandLogoProps = {
  size?: BrandLogoSize;
  /** إن وُجد يلفّ اللوجو برابط. مرّر null لمنع الرابط. */
  href?: string | null;
  className?: string;
  priority?: boolean;
};

/** المصدر 2172×724 (~3:1) */
const SIZE_MAP: Record<
  BrandLogoSize,
  { box: string; width: number; height: number }
> = {
  sm: { box: "h-8 w-[7.5rem] sm:h-9 sm:w-[8.75rem]", width: 280, height: 93 },
  md: { box: "h-9 w-[9.5rem] sm:h-10 sm:w-[11rem]", width: 330, height: 110 },
  lg: { box: "h-11 w-[12rem] sm:h-12 sm:w-[14rem]", width: 420, height: 140 },
};

export function BrandLogo({
  size = "md",
  href = "/",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const spec = SIZE_MAP[size];

  const image = (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden ${spec.box} ${className}`}
    >
      <Image
        src={SITE_LOGO_PATH}
        alt={SITE_NAME}
        width={spec.width}
        height={spec.height}
        priority={priority}
        className="h-full w-full object-contain object-center"
        sizes="(max-width: 640px) 10rem, 13rem"
      />
    </span>
  );

  if (href == null) {
    return image;
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      aria-label={SITE_NAME}
    >
      {image}
    </Link>
  );
}
