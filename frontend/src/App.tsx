import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEnvelopeSchema, apiFetch, formatCurrency } from "./lib";
import { mmSchema } from "./types";
import { DashboardPanel } from "@/features/dashboard/DashboardPanel";
import { SnapshotsPanel } from "@/features/snapshots/SnapshotsPanel";
import { TransactionsPanel } from "@/features/transactions/TransactionsPanel";
import { useAuthStore } from "@/shared/auth/authStore";
import { useSessionSync } from "@/shared/auth/useSessionSync";
import { sessionSchema } from "@/shared/auth/sessionSchema";
import { Field } from "@/shared/ui/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

const mmFormSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().nonnegative(),
  note: z.string().default("")
});

const navItems = ["dashboard", "transactions", "movements", "snapshots", "settings"] as const;
type NavItem = (typeof navItems)[number];

function App() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [editingMmId, setEditingMmId] = useState<string | null>(null);
  const [styleJson, setStyleJson] = useState("{}");
  const [accountOpen, setAccountOpen] = useState(false);

  useSessionSync();

  const mmQuery = useQuery({
    queryKey: ["movements"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/monthly-movements", { method: "GET" }, (raw) => apiEnvelopeSchema(z.array(mmSchema)).parse(raw).data)
  });

  const stylesQuery = useQuery({
    queryKey: ["styles"],
    enabled: !!user,
    queryFn: async () =>
      apiFetch(
        "/api/v1/assets/styles",
        { method: "GET" },
        (raw) => apiEnvelopeSchema(z.record(z.string(), z.object({ colorHex: z.string().nullable(), riskLevel: z.string().nullable() }))).parse(raw).data
      )
  });

  const prefsQuery = useQuery({
    queryKey: ["prefs"],
    enabled: !!user,
    queryFn: async () =>
      apiFetch(
        "/api/v1/preferences",
        { method: "GET" },
        (raw) => apiEnvelopeSchema(z.object({ showZeroAssets: z.boolean(), updatedAt: z.string().nullable().optional() })).parse(raw).data
      )
  });

  const loginForm = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema) });
  const mmForm = useForm<z.infer<typeof mmFormSchema>>({
    defaultValues: {
      name: "",
      direction: "income",
      amount: "" as unknown as number,
      note: ""
    }
  });
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

  const mmMutation = useMutation({
    mutationFn: async (values: z.infer<typeof mmFormSchema>) => {
      const payload = mmFormSchema.parse(values);
      if (editingMmId) {
        return apiFetch(
          `/api/v1/monthly-movements/${editingMmId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
        );
      }
      return apiFetch(
        "/api/v1/monthly-movements",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => apiEnvelopeSchema(z.object({ id: z.string() })).parse(raw).data
      );
    },
    onSuccess: async () => {
      setEditingMmId(null);
      mmForm.reset({ name: "", direction: "income", amount: "" as unknown as number, note: "" });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ path }: { path: string }) => apiFetch(path, { method: "DELETE" }, (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data),
    onSuccess: async (_data, { path }) => {
      if (path.startsWith("/api/v1/transactions/")) {
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      } else if (path.startsWith("/api/v1/monthly-movements/")) {
        await queryClient.invalidateQueries({ queryKey: ["movements"] });
      } else if (path.startsWith("/api/v1/monthly-snapshots/")) {
        await queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      }
    }
  });

  const prefsMutation = useMutation({
    mutationFn: async (showZeroAssets: boolean) =>
      apiFetch(
        "/api/v1/preferences",
        { method: "PUT", body: JSON.stringify({ showZeroAssets }) },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prefs"] });
    }
  });

  const stylesMutation = useMutation({
    mutationFn: async (styles: Record<string, { colorHex: string | null; riskLevel: string | null }>) =>
      apiFetch(
        "/api/v1/assets/styles",
        { method: "PUT", body: JSON.stringify({ styles }) },
        (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["styles"] });
    }
  });

  const purgeMutation = useMutation({
    mutationFn: async () => apiFetch("/api/v1/data/purge", { method: "POST" }, (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setNav("dashboard");
    }
  });

  const doExportJson = async () => {
    const payload = await apiFetch("/api/v1/backup/json", { method: "GET" }, (raw) => apiEnvelopeSchema(z.any()).parse(raw).data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `money-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImportJson = async (file: File) => {
    const parsed = JSON.parse(await file.text());
    await apiFetch("/api/v1/backup/json/import", { method: "POST", body: JSON.stringify(parsed) }, (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data);
    await queryClient.invalidateQueries();
  };

  const doExportXlsx = async () => {
    const res = await fetch("/api/v1/backup/xlsx", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `money-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImportXlsx = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/v1/backup/xlsx/import", { method: "POST", credentials: "include", body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await queryClient.invalidateQueries();
  };

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

      {nav === "movements" && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly movements</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <form className="grid gap-4" onSubmit={mmForm.handleSubmit((v) => mmMutation.mutate(v))}>
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
                <Field id="mm-name" label="Name">
                  <Input id="mm-name" type="text" {...mmForm.register("name")} />
                </Field>
                <Field id="mm-direction" label="Direction">
                  <Controller
                    control={mmForm.control}
                    name="direction"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v as "income" | "expense")}>
                        <SelectTrigger id="mm-direction">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">income</SelectItem>
                          <SelectItem value="expense">expense</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field id="mm-amount" label="Amount">
                  <Input id="mm-amount" type="number" step="0.01" placeholder="0" {...mmForm.register("amount")} />
                </Field>
                <Field id="mm-note" label="Note">
                  <Textarea id="mm-note" {...mmForm.register("note")} />
                </Field>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button type="submit">{editingMmId ? "Update" : "Add"}</Button>
                {editingMmId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingMmId(null);
                      mmForm.reset({ name: "", direction: "income", amount: "" as unknown as number, note: "" });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mmQuery.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.direction}</TableCell>
                    <TableCell>{formatCurrency(row.amount)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingMmId(row.id);
                            mmForm.reset({ name: row.name, direction: row.direction, amount: row.amount, note: row.note });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate({ path: `/api/v1/monthly-movements/${row.id}` })}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {nav === "snapshots" && <SnapshotsPanel />}

      {nav === "settings" && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preferences</CardTitle>
            </CardHeader>
            <CardContent>
              <Label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={Boolean(prefsQuery.data?.showZeroAssets)}
                  onCheckedChange={(checked) => prefsMutation.mutate(checked === true)}
                />
                Show zero-value assets
              </Label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Asset styles (JSON)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button variant="outline" size="sm" onClick={() => setStyleJson(JSON.stringify(stylesQuery.data ?? {}, null, 2))}>
                Load current
              </Button>
              <Textarea rows={10} value={styleJson} onChange={(e) => setStyleJson(e.target.value)} />
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(styleJson);
                    stylesMutation.mutate(parsed);
                  } catch {
                    alert("Invalid JSON");
                  }
                }}
              >
                Save styles
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Backup</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button variant="outline" size="sm" onClick={() => doExportJson().catch((err) => alert((err as Error).message))}>
                Export JSON
              </Button>
              <Label className="grid gap-1.5 rounded-md border border-dashed border-border p-3 cursor-pointer text-sm">
                Import JSON
                <Input
                  type="file"
                  accept=".json"
                  className="border-0 p-0 h-auto file:mr-2"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) doImportJson(file).catch((err) => alert((err as Error).message));
                  }}
                />
              </Label>
              <Button variant="outline" size="sm" onClick={() => doExportXlsx().catch((err) => alert((err as Error).message))}>
                Export XLSX
              </Button>
              <Label className="grid gap-1.5 rounded-md border border-dashed border-border p-3 cursor-pointer text-sm">
                Import XLSX
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  className="border-0 p-0 h-auto file:mr-2"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) doImportXlsx(file).catch((err) => alert((err as Error).message));
                  }}
                />
              </Label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Delete all money data for this account?")) purgeMutation.mutate();
                }}
              >
                Purge all data
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

export default App;
