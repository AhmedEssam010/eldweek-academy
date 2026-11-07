"use client";

import { useState } from "react";
import type { DashboardNavItem } from "@/lib/dashboard/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";

type DashboardLayoutProps = {
  title: string;
  roleLabel: string;
  fullName: string;
  navItems: DashboardNavItem[];
  children: React.ReactNode;
};

export function DashboardLayout({
  title,
  roleLabel,
  fullName,
  navItems,
  children,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-full bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_40%),#0B0913]">
      <DashboardSidebar
        items={navItems}
        roleLabel={roleLabel}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar
          title={title}
          fullName={fullName}
          onMenuOpen={() => setSidebarOpen(true)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
