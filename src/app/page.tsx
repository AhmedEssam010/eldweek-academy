import { Suspense } from "react";
import { NavbarHost } from "@/components/layout/NavbarHost";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/home/Hero";
import { Features } from "@/components/home/Features";
import { Courses } from "@/components/home/Courses";
import { HowToStart } from "@/components/home/HowToStart";
import { FAQ } from "@/components/home/FAQ";

function CoursesFallback() {
  return (
    <section className="border-b border-white/5" aria-busy="true">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white/10" />
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-72 animate-pulse rounded-2xl border border-white/10 bg-surface"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <NavbarHost overlay />
      <main className="flex-1">
        <Hero />
        <Features />
        <Suspense fallback={<CoursesFallback />}>
          <Courses />
        </Suspense>
        <HowToStart />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
