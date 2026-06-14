import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect
} from "@tanstack/react-router";
import { NotFound, PanelPending, RootShell } from "./router";

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
  component: lazyRouteComponent(
    () => import("@/features/dashboard/DashboardPanel"),
    "DashboardPanel"
  )
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: lazyRouteComponent(
    () => import("@/features/transactions/TransactionsPanel"),
    "TransactionsPanel"
  )
});

const movementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movements",
  component: lazyRouteComponent(
    () => import("@/features/movements/MovementsPanel"),
    "MovementsPanel"
  )
});

const snapshotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/snapshots",
  component: lazyRouteComponent(
    () => import("@/features/snapshots/SnapshotsPanel"),
    "SnapshotsPanel"
  )
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(
    () => import("@/features/settings/SettingsPanel"),
    "SettingsPanel"
  )
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
    defaultPendingComponent: PanelPending,
    ...opts
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
