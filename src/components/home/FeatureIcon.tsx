import {
  BookOpen,
  Brain,
  ClipboardList,
  Code2,
  FileCheck,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { FeatureItem } from "@/types";

const icons: Record<FeatureItem["icon"], LucideIcon> = {
  "book-open": BookOpen,
  "code-2": Code2,
  brain: Brain,
  "clipboard-list": ClipboardList,
  "file-check": FileCheck,
  layers: Layers,
};

type FeatureIconProps = {
  name: FeatureItem["icon"];
  className?: string;
};

export function FeatureIcon({ name, className = "h-6 w-6" }: FeatureIconProps) {
  const Icon = icons[name];
  return <Icon className={className} aria-hidden strokeWidth={1.75} />;
}
