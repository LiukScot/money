import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Pie } from "react-chartjs-2";
import { apiEnvelopeSchema, apiFetch, formatCurrency } from "./lib";

ChartJS.register(ArcElement, Tooltip, Legend);

type User = { id: number; email: string; name: string | null };
type AuthState = { user: User | null; setUser: (user: User | null) => void };
const useAuthStore = create<AuthState>((set) => ({ user: null, setUser: (user) => set({ user }) }));

const sessionSchema = apiEnvelopeSchema(
  z.object({
    authenticated: z.boolean(),
    user: z.object({ id: z.number(), email: z.string(), name: z.string().nullable() }).optional()
  })
);

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

const txSchema = z.object({
  id: z.string(),
  txDate: z.string(),
  asset: z.string(),
  tipo: z.string(),
  derivedType: z.string(),
  buyValue: z.number(),
  pnl: z.number(),
  currentValue: z.number(),
  note: z.string()
});

const mmSchema = z.object({
  id: z.string(),
  name: z.string(),
  direction: z.enum(["income", "expense"]),
  amount: z.number(),
  note: z.string()
});

const snapSchema = z.object({
  id: z.string(),
  snapshotDate: z.string(),
  lowRisk: z.number(),
  mediumRisk: z.number(),
  highRisk: z.number(),
  liquid: z.number()
});

const txFormSchema = z.object({
  txDate: z.string().min(1),
  asset: z.string().min(1),
  tipo: z.string().min(1),
  buyValue: z.coerce.number(),
  pnl: z.coerce.number(),
  note: z.string().default("")
});

const mmFormSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().nonnegative(),
  note: z.string().default("")
});

const snapFormSchema = z.object({
  snapshotDate: z.string().min(1),
  lowRisk: z.coerce.number(),
  mediumRisk: z.coerce.number(),
  highRisk: z.coerce.number(),
  liquid: z.coerce.number()
});

const navItems = ["dashboard", "transactions", "movements", "snapshots", "settings"] as const;
type NavItem = (typeof navItems)[number];

function App() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editingMmId, setEditingMmId] = useState<string | null>(null);
  const [editingSnapId, setEditingSnapId] = useState<string | null>(null);
  const [styleJson, setStyleJson] = useState("{}");

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: async () => apiFetch("/api/v1/auth/session", { method: "GET" }, (raw) => sessionSchema.parse(raw).data)
  });

  useEffect(() => {
    if (sessionQuery.data?.authenticated && sessionQuery.data.user && !user) {
      setUser(sessionQuery.data.user);
    }
    if (sessionQuery.data && !sessionQuery.data.authenticated && user) {
      setUser(null);
    }
  }, [sessionQuery.data, user, setUser]);

  const txQuery = useQuery({
    queryKey: ["transactions"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/transactions", { method: "GET" }, (raw) => apiEnvelopeSchema(z.array(txSchema)).parse(raw).data)
  });

  const mmQuery = useQuery({
    queryKey: ["movements"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/monthly-movements", { method: "GET" }, (raw) => apiEnvelopeSchema(z.array(mmSchema)).parse(raw).data)
  });

  const snapQuery = useQuery({
    queryKey: ["snapshots"],
    enabled: !!user,
    queryFn: async () => apiFetch("/api/v1/monthly-snapshots", { method: "GET" }, (raw) => apiEnvelopeSchema(z.array(snapSchema)).parse(raw).data)
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
  const txForm = useForm<z.infer<typeof txFormSchema>>({
    defaultValues: {
      txDate: new Date().toISOString().slice(0, 10),
      asset: "",
      tipo: "nuovo vincolo",
      buyValue: 0,
      pnl: 0,
      note: ""
    }
  });
  const mmForm = useForm<z.infer<typeof mmFormSchema>>({ defaultValues: { name: "", direction: "income", amount: 0, note: "" } });
  const snapForm = useForm<z.infer<typeof snapFormSchema>>({
    defaultValues: {
      snapshotDate: new Date().toISOString().slice(0, 10),
      lowRisk: 0,
      mediumRisk: 0,
      highRisk: 0,
      liquid: 0
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

  const txMutation = useMutation({
    mutationFn: async (values: z.infer<typeof txFormSchema>) => {
      const parsed = txFormSchema.parse(values);
      const payload = {
        txDate: parsed.txDate,
        asset: parsed.asset,
        tipo: parsed.tipo,
        buyValue: Number(parsed.buyValue),
        pnl: Number(parsed.pnl),
        currentValue: Number(parsed.buyValue) + Number(parsed.pnl),
        note: parsed.note
      };
      if (editingTxId) {
        return apiFetch(
          `/api/v1/transactions/${editingTxId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
        );
      }
      return apiFetch(
        "/api/v1/transactions",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => apiEnvelopeSchema(z.object({ id: z.string() })).parse(raw).data
      );
    },
    onSuccess: async () => {
      setEditingTxId(null);
      txForm.reset({ txDate: new Date().toISOString().slice(0, 10), asset: "", tipo: "nuovo vincolo", buyValue: 0, pnl: 0, note: "" });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
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
      mmForm.reset({ name: "", direction: "income", amount: 0, note: "" });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
    }
  });

  const snapMutation = useMutation({
    mutationFn: async (values: z.infer<typeof snapFormSchema>) => {
      const payload = snapFormSchema.parse(values);
      if (editingSnapId) {
        return apiFetch(
          `/api/v1/monthly-snapshots/${editingSnapId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data
        );
      }
      return apiFetch(
        "/api/v1/monthly-snapshots",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => apiEnvelopeSchema(z.object({ id: z.string() })).parse(raw).data
      );
    },
    onSuccess: async () => {
      setEditingSnapId(null);
      snapForm.reset({ snapshotDate: new Date().toISOString().slice(0, 10), lowRisk: 0, mediumRisk: 0, highRisk: 0, liquid: 0 });
      await queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ path }: { path: string }) => apiFetch(path, { method: "DELETE" }, (raw) => apiEnvelopeSchema(z.object({ ok: z.boolean() })).parse(raw).data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      await queryClient.invalidateQueries({ queryKey: ["snapshots"] });
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

  const dashboard = useMemo(() => {
    const tx = txQuery.data ?? [];
    const mm = mmQuery.data ?? [];
    const totalInvested = tx.reduce((sum, row) => sum + row.currentValue, 0);
    const totalPnl = tx.reduce((sum, row) => sum + row.pnl, 0);
    const assets = Array.from(new Set(tx.map((row) => row.asset)));
    const income = mm.filter((row) => row.direction === "income").reduce((sum, row) => sum + row.amount, 0);
    const expense = mm.filter((row) => row.direction === "expense").reduce((sum, row) => sum + row.amount, 0);
    return {
      totalInvested,
      totalPnl,
      assets: assets.length,
      txCount: tx.length,
      monthlyIncome: income,
      monthlyExpense: expense,
      monthlyNet: income - expense,
      pieData: {
        labels: assets,
        datasets: [
          {
            label: "Allocation",
            data: assets.map((asset) => tx.filter((row) => row.asset === asset).reduce((sum, row) => sum + row.currentValue, 0)),
            backgroundColor: assets.map((asset, index) => stylesQuery.data?.[asset]?.colorHex || ["#5de2a5", "#7fc3ff", "#ffd57f", "#ff8da1", "#c6a3ff", "#9bd8ff"][index % 6])
          }
        ]
      }
    };
  }, [txQuery.data, mmQuery.data, stylesQuery.data]);

  const doExportJson = async () => {
    const payload = await apiFetch("/api/v1/backup/json", { method: "GET" }, (raw) => apiEnvelopeSchema(z.any()).parse(raw).data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mymoney-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    a.download = `mymoney-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
      <main className="screen auth-screen">
        <section className="auth-card">
          <h1>myMoney</h1>
          <p>Sign in to access your private money workspace.</p>
          <form className="stack" onSubmit={loginForm.handleSubmit((values) => loginMutation.mutate(values))}>
            <label>
              Email
              <input type="email" {...loginForm.register("email")} />
            </label>
            <label>
              Password
              <input type="password" {...loginForm.register("password")} />
            </label>
            <button type="submit" disabled={loginMutation.isPending}>{loginMutation.isPending ? "Signing in..." : "Sign in"}</button>
            {loginMutation.error && <p className="error">{String((loginMutation.error as Error).message)}</p>}
            <p className="hint">Signup is disabled. Use CLI provisioning.</p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="screen app-screen">
      <header className="app-header">
        <div>
          <h1>myMoney</h1>
          <p>{user.email}</p>
        </div>
        <details>
          <summary>Account</summary>
          <form className="stack" onSubmit={changePasswordForm.handleSubmit((v) => changePasswordMutation.mutate(v))}>
            <label>Current password<input type="password" {...changePasswordForm.register("currentPassword")} /></label>
            <label>New password<input type="password" {...changePasswordForm.register("newPassword")} /></label>
            <label>Confirm<input type="password" {...changePasswordForm.register("confirmPassword")} /></label>
            <button type="submit" disabled={changePasswordMutation.isPending}>Change password</button>
            {changePasswordMutation.error && <p className="error">{String((changePasswordMutation.error as Error).message)}</p>}
          </form>
          <button onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>Log out</button>
        </details>
      </header>

      <nav className="nav-grid">
        {navItems.map((item) => (
          <button key={item} className={item === nav ? "active" : ""} onClick={() => setNav(item)}>{item}</button>
        ))}
      </nav>

      {nav === "dashboard" && (
        <section className="panel">
          <h2>Dashboard</h2>
          <div className="stats-grid">
            <article><h3>Total invested</h3><strong>{formatCurrency(dashboard.totalInvested)}</strong></article>
            <article><h3>Total PnL</h3><strong>{formatCurrency(dashboard.totalPnl)}</strong></article>
            <article><h3>Assets</h3><strong>{dashboard.assets}</strong></article>
            <article><h3>Transactions</h3><strong>{dashboard.txCount}</strong></article>
            <article><h3>Monthly income</h3><strong>{formatCurrency(dashboard.monthlyIncome)}</strong></article>
            <article><h3>Monthly expense</h3><strong>{formatCurrency(dashboard.monthlyExpense)}</strong></article>
            <article><h3>Monthly net</h3><strong>{formatCurrency(dashboard.monthlyNet)}</strong></article>
          </div>
          <div className="chart-wrap">
            <Pie data={dashboard.pieData} />
          </div>
        </section>
      )}

      {nav === "transactions" && (
        <section className="panel">
          <h2>Transactions</h2>
          <form className="form-grid" onSubmit={txForm.handleSubmit((v) => txMutation.mutate(v))}>
            <label>Date<input type="date" {...txForm.register("txDate")} /></label>
            <label>Asset<input {...txForm.register("asset")} /></label>
            <label>Tipo<input {...txForm.register("tipo")} /></label>
            <label>Buy value<input type="number" step="0.01" {...txForm.register("buyValue", { valueAsNumber: true })} /></label>
            <label>PnL<input type="number" step="0.01" {...txForm.register("pnl", { valueAsNumber: true })} /></label>
            <label>Note<textarea {...txForm.register("note")} /></label>
            <div className="row-actions">
              <button type="submit">{editingTxId ? "Update" : "Add"}</button>
              {editingTxId && <button type="button" onClick={() => { setEditingTxId(null); txForm.reset({ txDate: new Date().toISOString().slice(0, 10), asset: "", tipo: "nuovo vincolo", buyValue: 0, pnl: 0, note: "" }); }}>Cancel</button>}
            </div>
          </form>

          <table>
            <thead><tr><th>Date</th><th>Asset</th><th>Tipo</th><th>Current</th><th>PnL</th><th>Actions</th></tr></thead>
            <tbody>
              {(txQuery.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.txDate}</td>
                  <td>{row.asset}</td>
                  <td>{row.tipo}</td>
                  <td>{formatCurrency(row.currentValue)}</td>
                  <td>{formatCurrency(row.pnl)}</td>
                  <td>
                    <button onClick={() => { setEditingTxId(row.id); txForm.reset({ txDate: row.txDate, asset: row.asset, tipo: row.tipo, buyValue: row.buyValue, pnl: row.pnl, note: row.note }); }}>Edit</button>
                    <button onClick={() => deleteMutation.mutate({ path: `/api/v1/transactions/${row.id}` })}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {nav === "movements" && (
        <section className="panel">
          <h2>Monthly movements</h2>
          <form className="form-grid" onSubmit={mmForm.handleSubmit((v) => mmMutation.mutate(v))}>
            <label>Name<input {...mmForm.register("name")} /></label>
            <label>Direction<select {...mmForm.register("direction")}><option value="income">income</option><option value="expense">expense</option></select></label>
            <label>Amount<input type="number" step="0.01" {...mmForm.register("amount", { valueAsNumber: true })} /></label>
            <label>Note<textarea {...mmForm.register("note")} /></label>
            <div className="row-actions"><button type="submit">{editingMmId ? "Update" : "Add"}</button>{editingMmId && <button type="button" onClick={() => { setEditingMmId(null); mmForm.reset({ name: "", direction: "income", amount: 0, note: "" }); }}>Cancel</button>}</div>
          </form>

          <table>
            <thead><tr><th>Name</th><th>Direction</th><th>Amount</th><th>Actions</th></tr></thead>
            <tbody>
              {(mmQuery.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.direction}</td>
                  <td>{formatCurrency(row.amount)}</td>
                  <td>
                    <button onClick={() => { setEditingMmId(row.id); mmForm.reset({ name: row.name, direction: row.direction, amount: row.amount, note: row.note }); }}>Edit</button>
                    <button onClick={() => deleteMutation.mutate({ path: `/api/v1/monthly-movements/${row.id}` })}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {nav === "snapshots" && (
        <section className="panel">
          <h2>Monthly snapshots</h2>
          <form className="form-grid" onSubmit={snapForm.handleSubmit((v) => snapMutation.mutate(v))}>
            <label>Date<input type="date" {...snapForm.register("snapshotDate")} /></label>
            <label>Low risk<input type="number" step="0.01" {...snapForm.register("lowRisk", { valueAsNumber: true })} /></label>
            <label>Medium risk<input type="number" step="0.01" {...snapForm.register("mediumRisk", { valueAsNumber: true })} /></label>
            <label>High risk<input type="number" step="0.01" {...snapForm.register("highRisk", { valueAsNumber: true })} /></label>
            <label>Liquid<input type="number" step="0.01" {...snapForm.register("liquid", { valueAsNumber: true })} /></label>
            <div className="row-actions"><button type="submit">{editingSnapId ? "Update" : "Add"}</button>{editingSnapId && <button type="button" onClick={() => { setEditingSnapId(null); snapForm.reset({ snapshotDate: new Date().toISOString().slice(0, 10), lowRisk: 0, mediumRisk: 0, highRisk: 0, liquid: 0 }); }}>Cancel</button>}</div>
          </form>

          <table>
            <thead><tr><th>Date</th><th>Low</th><th>Medium</th><th>High</th><th>Liquid</th><th>Actions</th></tr></thead>
            <tbody>
              {(snapQuery.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.snapshotDate}</td>
                  <td>{formatCurrency(row.lowRisk)}</td>
                  <td>{formatCurrency(row.mediumRisk)}</td>
                  <td>{formatCurrency(row.highRisk)}</td>
                  <td>{formatCurrency(row.liquid)}</td>
                  <td>
                    <button onClick={() => { setEditingSnapId(row.id); snapForm.reset({ snapshotDate: row.snapshotDate, lowRisk: row.lowRisk, mediumRisk: row.mediumRisk, highRisk: row.highRisk, liquid: row.liquid }); }}>Edit</button>
                    <button onClick={() => deleteMutation.mutate({ path: `/api/v1/monthly-snapshots/${row.id}` })}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {nav === "settings" && (
        <section className="panel">
          <h2>Settings</h2>
          <div className="settings-grid">
            <article className="stack">
              <h3>Preferences</h3>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(prefsQuery.data?.showZeroAssets)}
                  onChange={(e) => prefsMutation.mutate(e.target.checked)}
                />
                Show zero-value assets
              </label>
            </article>

            <article className="stack">
              <h3>Asset styles (JSON)</h3>
              <button onClick={() => setStyleJson(JSON.stringify(stylesQuery.data ?? {}, null, 2))}>Load current</button>
              <textarea rows={10} value={styleJson} onChange={(e) => setStyleJson(e.target.value)} />
              <button
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
              </button>
            </article>

            <article className="stack">
              <h3>Backup</h3>
              <button onClick={doExportJson}>Export JSON</button>
              <label className="file-input">Import JSON<input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) doImportJson(file).catch((err) => alert((err as Error).message)); }} /></label>
              <button onClick={() => doExportXlsx().catch((err) => alert((err as Error).message))}>Export XLSX</button>
              <label className="file-input">Import XLSX<input type="file" accept=".xlsx,.xls" onChange={(e) => { const file = e.target.files?.[0]; if (file) doImportXlsx(file).catch((err) => alert((err as Error).message)); }} /></label>
            </article>

            <article className="stack">
              <h3>Danger zone</h3>
              <button className="danger" onClick={() => { if (confirm("Delete all myMoney data for this account?")) purgeMutation.mutate(); }}>Purge all data</button>
            </article>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
