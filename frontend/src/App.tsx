import { useState } from "react";
import { DashboardPanel } from "@/features/dashboard/DashboardPanel";
import { SnapshotsPanel } from "@/features/snapshots/SnapshotsPanel";
import { TransactionsPanel } from "@/features/transactions/TransactionsPanel";
import { MovementsPanel } from "@/features/movements/MovementsPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { useAuthStore } from "@/shared/auth/authStore";
import { useSessionSync } from "@/shared/auth/useSessionSync";
import { Button } from "@/components/ui/button";

const navItems = ["dashboard", "transactions", "movements", "snapshots", "settings"] as const;
type NavItem = (typeof navItems)[number];

function App() {
  const user = useAuthStore((s) => s.user);
  const [nav, setNav] = useState<NavItem>("dashboard");

  useSessionSync();

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
          <Button
            key={item}
            size="sm"
            variant={item === nav ? "default" : "ghost"}
            onClick={() => setNav(item)}
          >
            {item}
          </Button>
        ))}
      </nav>

      {nav === "dashboard" && <DashboardPanel />}
      {nav === "transactions" && <TransactionsPanel />}
      {nav === "movements" && <MovementsPanel />}
      {nav === "snapshots" && <SnapshotsPanel />}
      {nav === "settings" && <SettingsPanel onPurged={() => setNav("dashboard")} />}
    </main>
  );
}

export default App;
