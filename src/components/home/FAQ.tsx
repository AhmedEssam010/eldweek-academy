"use client";

import { useState } from "react";
import { faqItems } from "@/lib/data/faq";

export function FAQ() {
  const [openId, setOpenId] = useState<string | null>(faqItems[0]?.id ?? null);

  return (
    <section
      id="faq"
      className="border-b border-white/5"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <h2 id="faq-heading" className="text-2xl font-bold text-white sm:text-3xl">
            الأسئلة الشائعة
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/70 sm:text-base">
            إجابات مختصرة عن أكثر الأسئلة التي قد تخطر ببالك قبل البدء.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {faqItems.map((item) => {
            const isOpen = openId === item.id;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-surface"
              >
                <h3>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start text-sm font-semibold text-white sm:text-base"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${item.id}`}
                    id={`faq-button-${item.id}`}
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                  >
                    <span>{item.question}</span>
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-light-purple transition ${isOpen ? "rotate-45 bg-primary/20" : ""}`}
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-panel-${item.id}`}
                  role="region"
                  aria-labelledby={`faq-button-${item.id}`}
                  hidden={!isOpen}
                  className="px-5 pb-5 text-sm leading-7 text-white/70"
                >
                  {item.answer}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
