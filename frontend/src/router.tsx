import { lazy, Suspense } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools
      }))
    )
  : () => null;
import { AccountMenu } from "@/features/auth/AccountMenu";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { DashboardPanel } from "@/features/dashboard/DashboardPanel";
import { MovementsPanel } from "@/features/movements/MovementsPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { SnapshotsPanel } from "@/features/snapshots/SnapshotsPanel";
import { TransactionsPanel } from "@/features/transactions/TransactionsPanel";
import { useAuthStore } from "@/shared/auth/authStore";
import { useSessionSync } from "@/shared/auth/useSessionSync";

const navItems = [
  { to: "/dashboard", label: "dashboard" },
  { to: "/transactions", label: "transactions" },
  { to: "/movements", label: "movements" },
  { to: "/snapshots", label: "snapshots" },
  { to: "/settings", label: "settings" }
] as const;

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      activeProps={{ "data-active": "true" }}
      className="group/navlink"
    >
      {({ isActive }) => (
        <Button asChild size="sm" variant={isActive ? "default" : "ghost"}>
          <span>{label}</span>
        </Button>
      )}
    </Link>
  );
}

function RootShell() {
  const user = useAuthStore((s) => s.user);
  const sessionQuery = useSessionSync();

  if (sessionQuery.isLoading) {
    return (
      <main className="min-h-screen grid place-items-center p-6 text-sm text-muted-foreground" />
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <main className="min-h-screen mx-auto max-w-[1300px] w-[96vw] grid gap-4 p-6">
      <header className="flex justify-between items-start gap-5 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold m-0">money</h1>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        </div>
        <AccountMenu />
      </header>

      <nav className="flex flex-wrap gap-2">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} label={item.label} />
        ))}
      </nav>

      <Outlet />
      <Suspense fallback={null}>
        <RouterDevtools />
      </Suspense>
    </main>
  );
}

const rootRoute = createRootRoute({
  component: RootShell
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  }
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPanel
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: TransactionsPanel
});

const movementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movements",
  component: MovementsPanel
});

const snapshotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/snapshots",
  component: SnapshotsPanel
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPanel
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  transactionsRoute,
  movementsRoute,
  snapshotsRoute,
  settingsRoute
]);

const NotFound = () => (
  <main className="min-h-screen grid place-items-center p-6">
    <div className="text-center grid gap-2">
      <h2 className="text-2xl font-semibold">Page not found</h2>
      <Link to="/dashboard" className="text-sm text-muted-foreground underline">
        Back to dashboard
      </Link>
    </div>
  </main>
);

export function createAppRouter(
  opts: Partial<Parameters<typeof createRouter>[0]> = {}
) {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: NotFound,
    ...opts
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
