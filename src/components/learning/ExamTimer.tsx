"use client";

import { useEffect, useState } from "react";

type ExamTimerProps = {
  /** وقت انتهاء من الخادم (ISO) — لا نعتمد على ساعة العميل كمصدر ثقة */
  endsAt: string | null;
  serverNow: string;
  label?: string;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * مؤقّت واجهة فقط. انتهاء الصلاحية يُحسم على الخادم عند التسليم/البدء.
 */
export function ExamTimer({
  endsAt,
  serverNow,
  label = "الوقت المتبقي (عرض تقريبي)",
}: ExamTimerProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(() => {
    if (!endsAt) return null;
    return new Date(endsAt).getTime() - new Date(serverNow).getTime();
  });

  useEffect(() => {
    if (!endsAt) return;
    const skew = Date.now() - new Date(serverNow).getTime();
    const tick = () => {
      setRemainingMs(new Date(endsAt).getTime() - (Date.now() - skew));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, serverNow]);

  if (!endsAt || remainingMs === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-background/40 px-4 py-3 text-sm text-white/60">
        لا يوجد حد زمني محدد لهذا الامتحان.
      </div>
    );
  }

  const expired = remainingMs <= 0;

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        expired
          ? "border-red-400/40 bg-red-500/10 text-red-200"
          : "border-secondary/30 bg-secondary/10 text-light-purple"
      }`}
    >
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-1 font-semibold tracking-wider">
        {expired ? "انتهى الوقت — التسليم يُحسم على الخادم" : formatRemaining(remainingMs)}
      </p>
    </div>
  );
}
