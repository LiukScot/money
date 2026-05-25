import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch } from "./lib";
import { DashboardPanel } from "@/features/dashboard/DashboardPanel";
import { SnapshotsPanel } from "@/features/snapshots/SnapshotsPanel";
import { TransactionsPanel } from "@/features/transactions/TransactionsPanel";
import { MovementsPanel } from "@/features/movements/MovementsPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { useAuthStore } from "@/shared/auth/authStore";
import { useSessionSync } from "@/shared/auth/useSessionSync";
import { sessionSchema } from "@/shared/auth/sessionSchema";
import { Field } from "@/shared/ui/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

const navItems = ["dashboard", "transactions", "movements", "snapshots", "settings"] as const;
type NavItem = (typeof navItems)[number];

function App() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [accountOpen, setAccountOpen] = useState(false);

  useSessionSync();

  const loginForm = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema) });

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) =>
      apiFetch(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify(values) },
        (raw) => apiEnvelopeSchema(z.object({ email: z.string(), name: z.string().nullable() })).parse(raw).data
      ),
    onSuccess: async () => {
      const session = await queryClient.fetchQuery({
        queryKey: ["session"],
        queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionSchema.parse(raw).data)
      });
      if (session.authenticated && session.user) {
        setUser(session.user);
      }
      loginForm.reset();
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => apiFetch("/api/v1/auth/logout", { method: "POST" }, (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data),
    onSuccess: async () => {
      setUser(null);
      await queryClient.invalidateQueries();
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (values: z.infer<typeof changePasswordSchema>) =>
      apiFetch(
        "/api/v1/auth/change-password",
        { method: "POST", body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: () => {
      changePasswordForm.reset();
      alert("Password updated");
    }
  });

  if (!user) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="m-0 text-2xl font-semibold">money</h1>
            <p className="text-sm text-muted-foreground">Sign in to access your private money workspace.</p>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={loginForm.handleSubmit((values) => loginMutation.mutate(values))}>
              <Field id="login-email" label="Email">
                <Input id="login-email" type="email" autoComplete="email" {...loginForm.register("email")} />
              </Field>
              <Field id="login-password" label="Password">
                <Input id="login-password" type="password" autoComplete="current-password" {...loginForm.register("password")} />
              </Field>
              <Button type="submit" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
              {loginMutation.error && (
                <Alert variant="destructive">
                  <AlertDescription>{String((loginMutation.error as Error).message)}</AlertDescription>
                </Alert>
              )}
              <p className="text-sm text-muted-foreground">Signup is disabled. Use CLI provisioning.</p>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen mx-auto max-w-[1300px] w-[96vw] grid gap-4 p-6">
      <header className="flex justify-between items-start gap-5 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold m-0">money</h1>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        </div>
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setAccountOpen((o) => !o)} aria-expanded={accountOpen}>
            Account
          </Button>
          {accountOpen && (
            <div className="absolute right-0 top-full mt-2 z-20 w-80 rounded-lg border border-border bg-popover p-4 shadow-lg">
              <form
                className="grid gap-3"
                onSubmit={changePasswordForm.handleSubmit((v) => changePasswordMutation.mutate(v))}
              >
                <Field id="cp-current" label="Current password">
                  <Input id="cp-current" type="password" autoComplete="current-password" {...changePasswordForm.register("currentPassword")} />
                </Field>
                <Field id="cp-new" label="New password">
                  <Input id="cp-new" type="password" autoComplete="new-password" {...changePasswordForm.register("newPassword")} />
                </Field>
                <Field id="cp-confirm" label="Confirm">
                  <Input id="cp-confirm" type="password" autoComplete="new-password" {...changePasswordForm.register("confirmPassword")} />
                </Field>
                <Button type="submit" size="sm" disabled={changePasswordMutation.isPending}>
                  Change password
                </Button>
                {changePasswordMutation.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{String((changePasswordMutation.error as Error).message)}</AlertDescription>
                  </Alert>
                )}
              </form>
              <div className="mt-3 pt-3 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                  Log out
                </Button>
              </div>
            </div>
          )}
        </div>
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
