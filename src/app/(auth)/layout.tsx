import { NavbarHost } from "@/components/layout/NavbarHost";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <NavbarHost />
      {children}
    </div>
  );
}
