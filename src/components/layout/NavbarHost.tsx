import { Suspense } from "react";
import { Navbar, type NavbarAuthUser } from "@/components/layout/Navbar";
import { getProfileAuthState } from "@/lib/auth/profile";
import { dashboardHrefForRole } from "@/lib/auth/dashboard-path";

type NavbarHostProps = {
  overlay?: boolean;
};

async function AuthenticatedNavbar({ overlay = false }: NavbarHostProps) {
  const state = await getProfileAuthState();

  let auth: NavbarAuthUser | null = null;
  if (state.status === "authenticated") {
    auth = {
      fullName: state.fullName,
      role: state.role,
      dashboardHref: dashboardHrefForRole(state.role),
    };
  }

  return <Navbar overlay={overlay} auth={auth} />;
}

/**
 * Navbar مشترك مع حالة جلسة من الخادم.
 * Suspense يمنع إظهار أزرار الضيف بالخطأ أثناء تحميل المصادقة.
 */
export function NavbarHost({ overlay = false }: NavbarHostProps) {
  return (
    <Suspense fallback={<Navbar overlay={overlay} auth="loading" />}>
      <AuthenticatedNavbar overlay={overlay} />
    </Suspense>
  );
}
