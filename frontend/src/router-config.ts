import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect
} from "@tanstack/react-router";
import { DashboardPanel } from "@/features/dashboard/DashboardPanel";
import { MovementsPanel } from "@/features/movements/MovementsPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { SnapshotsPanel } from "@/features/snapshots/SnapshotsPanel";
import { TransactionsPanel } from "@/features/transactions/TransactionsPanel";
import { NotFound, RootShell } from "./router";

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
