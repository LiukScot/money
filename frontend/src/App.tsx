import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { apiEnvelopeSchema, apiFetch, formatCurrency } from "./lib";
import { mmSchema, snapSchema, txSchema } from "./types";
import { DashboardPanel } from "./components/dashboard/DashboardPanel";
import { MonthlyRiskChart } from "./components/snapshots/MonthlyRiskChart";
import { computePerAsset } from "./lib/dashboard";

const TIPO_OPTIONS = ["nuovo vincolo", "cedola", "interessi", "cashback", "Variazione Valore"] as const;
const TIPO_PNL_ONLY = new Set<string>(["cedola", "interessi", "cashback", "Variazione Valore"]);
const TIPO_BUY_ONLY = new Set<string>(["nuovo vincolo"]);
function tipoShowsBuyValue(tipo: string): boolean {
  if (TIPO_PNL_ONLY.has(tipo)) return false;
  return true;
}
function tipoShowsPnl(tipo: string): boolean {
  if (TIPO_BUY_ONLY.has(tipo)) return false;
  return true;
}

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
      // reason: empty string renders placeholder; z.coerce.number maps "" → 0 at submit
      buyValue: "" as unknown as number,
      pnl: "" as unknown as number,
      note: ""
    }
  });
  const watchedTipo = txForm.watch("tipo");
  const showBuyValue = tipoShowsBuyValue(watchedTipo);
  const showPnl = tipoShowsPnl(watchedTipo);

  const assetOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of txQuery.data ?? []) {
      if (row.asset) set.add(row.asset);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [txQuery.data]);

  const [assetComboOpen, setAssetComboOpen] = useState(false);
  const [assetFocusedIdx, setAssetFocusedIdx] = useState(-1);
  const watchedAsset = txForm.watch("asset");
  const filteredAssetOptions = useMemo(() => {
    const q = (watchedAsset ?? "").toLowerCase().trim();
    if (!q) return assetOptions;
    return assetOptions.filter((a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q);
  }, [assetOptions, watchedAsset]);

  useEffect(() => {
    setAssetFocusedIdx(-1);
  }, [watchedAsset, assetComboOpen]);

  const visibleAssetOptions = filteredAssetOptions.slice(0, 8);
  const selectAssetOption = (a: string) => {
    txForm.setValue("asset", a, { shouldDirty: true });
    setAssetComboOpen(false);
    setAssetFocusedIdx(-1);
  };
  const handleAssetKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!assetComboOpen) setAssetComboOpen(true);
      setAssetFocusedIdx((i) => (visibleAssetOptions.length === 0 ? -1 : (i + 1) % visibleAssetOptions.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!assetComboOpen) setAssetComboOpen(true);
      setAssetFocusedIdx((i) => {
        if (visibleAssetOptions.length === 0) return -1;
        return i <= 0 ? visibleAssetOptions.length - 1 : i - 1;
      });
    } else if (e.key === "Enter" && assetComboOpen && assetFocusedIdx >= 0) {
      const choice = visibleAssetOptions[assetFocusedIdx];
      if (choice) {
        e.preventDefault();
        selectAssetOption(choice);
      }
    } else if (e.key === "Escape" && assetComboOpen) {
      e.preventDefault();
      setAssetComboOpen(false);
    }
  };
  const mmForm = useForm<z.infer<typeof mmFormSchema>>({
    defaultValues: {
      name: "",
      direction: "income",
      // reason: empty string renders placeholder; z.coerce.number maps "" → 0 at submit
      amount: "" as unknown as number,
      note: ""
    }
  });
  const snapForm = useForm<z.infer<typeof snapFormSchema>>({
    defaultValues: {
      snapshotDate: new Date().toISOString().slice(0, 10),
      // reason: empty string renders placeholder; z.coerce.number maps "" → 0 at submit
      liquid: "" as unknown as number
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
      const buyValue = tipoShowsBuyValue(parsed.tipo) ? Number(parsed.buyValue) : 0;
      const pnl = tipoShowsPnl(parsed.tipo) ? Number(parsed.pnl) : 0;
      const payload = {
        txDate: parsed.txDate,
        asset: parsed.asset,
        tipo: parsed.tipo,
        buyValue,
        pnl,
        currentValue: buyValue + pnl,
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
      txForm.reset({ txDate: new Date().toISOString().slice(0, 10), asset: "", tipo: "nuovo vincolo", buyValue: "" as unknown as number, pnl: "" as unknown as number, note: "" });
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
      mmForm.reset({ name: "", direction: "income", amount: "" as unknown as number, note: "" });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
    }
  });

  const snapMutation = useMutation({
    mutationFn: async (values: z.infer<typeof snapFormSchema>) => {
      const form = snapFormSchema.parse(values);
      if (!txQuery.isSuccess || !stylesQuery.isSuccess) {
        throw new Error("Attendi il caricamento di transazioni e stili asset prima di creare uno snapshot.");
      }
      const stats = computePerAsset(txQuery.data, stylesQuery.data);
      const totals = { low: 0, medium: 0, high: 0 };
      for (const s of stats) {
        if (s.riskLevel === "low") totals.low += s.current;
        else if (s.riskLevel === "medium") totals.medium += s.current;
        else if (s.riskLevel === "high") totals.high += s.current;
      }
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const payload = {
        snapshotDate: form.snapshotDate,
        lowRisk: round2(totals.low),
        mediumRisk: round2(totals.medium),
        highRisk: round2(totals.high),
        liquid: form.liquid
      };
      return apiFetch(
        "/api/v1/monthly-snapshots",
        { method: "POST", body: JSON.stringify(payload) },
        (raw) => apiEnvelopeSchema(z.object({ id: z.string() })).parse(raw).data
      );
    },
    onSuccess: async () => {
      snapForm.reset({ snapshotDate: new Date().toISOString().slice(0, 10), liquid: "" as unknown as number });
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
            <label htmlFor="login-email">
              Email
              <input id="login-email" type="email" autoComplete="email" {...loginForm.register("email")} />
            </label>
            <label htmlFor="login-password">
              Password
              <input id="login-password" type="password" autoComplete="current-password" {...loginForm.register("password")} />
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
            <label htmlFor="cp-current">Current password<input id="cp-current" type="password" autoComplete="current-password" {...changePasswordForm.register("currentPassword")} /></label>
            <label htmlFor="cp-new">New password<input id="cp-new" type="password" autoComplete="new-password" {...changePasswordForm.register("newPassword")} /></label>
            <label htmlFor="cp-confirm">Confirm<input id="cp-confirm" type="password" autoComplete="new-password" {...changePasswordForm.register("confirmPassword")} /></label>
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

      {nav === "dashboard" && <DashboardPanel />}

      {nav === "transactions" && (
        <section className="panel">
          <h2>Transactions</h2>
          <form onSubmit={txForm.handleSubmit((v) => txMutation.mutate(v))}>
            <div className="form-grid">
              <label htmlFor="tx-date">Date<input id="tx-date" type="date" {...txForm.register("txDate")} /></label>
              <label htmlFor="tx-asset" className="combo">
                Asset
                <input
                  id="tx-asset"
                  type="text"
                  autoComplete="off"
                  placeholder={assetOptions.length > 0 ? "digita o scegli" : "es. revolut"}
                  role="combobox"
                  aria-expanded={assetComboOpen}
                  aria-controls="tx-asset-combo-list"
                  aria-activedescendant={assetComboOpen && assetFocusedIdx >= 0 ? `tx-asset-opt-${assetFocusedIdx}` : undefined}
                  {...txForm.register("asset")}
                  onFocus={() => setAssetComboOpen(true)}
                  onBlur={() => window.setTimeout(() => setAssetComboOpen(false), 120)}
                  onKeyDown={handleAssetKeyDown}
                />
                {assetComboOpen && visibleAssetOptions.length > 0 && (
                  <ul id="tx-asset-combo-list" className="combo-list" role="listbox">
                    {visibleAssetOptions.map((a, idx) => (
                      <li key={a} id={`tx-asset-opt-${idx}`} role="option" aria-selected={assetFocusedIdx === idx}>
                        <button
                          type="button"
                          className={"combo-item" + (assetFocusedIdx === idx ? " is-focused" : "")}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectAssetOption(a);
                          }}
                        >
                          {a}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </label>
              <label htmlFor="tx-tipo">
                Tipo
                <select id="tx-tipo" {...txForm.register("tipo")}>
                  {TIPO_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {showBuyValue && <label htmlFor="tx-buyValue">Buy value<input id="tx-buyValue" type="number" step="0.01" placeholder="0" {...txForm.register("buyValue")} /></label>}
              {showPnl && <label htmlFor="tx-pnl">PnL<input id="tx-pnl" type="number" step="0.01" placeholder="0" {...txForm.register("pnl")} /></label>}
              <label htmlFor="tx-note">Note<textarea id="tx-note" {...txForm.register("note")} /></label>
            </div>
            <div className="row-actions">
              <button type="submit">{editingTxId ? "Update" : "Add"}</button>
              {editingTxId && <button type="button" onClick={() => { setEditingTxId(null); txForm.reset({ txDate: new Date().toISOString().slice(0, 10), asset: "", tipo: "nuovo vincolo", buyValue: "" as unknown as number, pnl: "" as unknown as number, note: "" }); }}>Cancel</button>}
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
          <form onSubmit={mmForm.handleSubmit((v) => mmMutation.mutate(v))}>
            <div className="form-grid">
              <label htmlFor="mm-name">Name<input id="mm-name" type="text" {...mmForm.register("name")} /></label>
              <label htmlFor="mm-direction">Direction<select id="mm-direction" {...mmForm.register("direction")}><option value="income">income</option><option value="expense">expense</option></select></label>
              <label htmlFor="mm-amount">Amount<input id="mm-amount" type="number" step="0.01" placeholder="0" {...mmForm.register("amount")} /></label>
              <label htmlFor="mm-note">Note<textarea id="mm-note" {...mmForm.register("note")} /></label>
            </div>
            <div className="row-actions"><button type="submit">{editingMmId ? "Update" : "Add"}</button>{editingMmId && <button type="button" onClick={() => { setEditingMmId(null); mmForm.reset({ name: "", direction: "income", amount: "" as unknown as number, note: "" }); }}>Cancel</button>}</div>
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
          <MonthlyRiskChart snapshots={snapQuery.data ?? []} />
          <form onSubmit={snapForm.handleSubmit((v) => snapMutation.mutate(v))}>
            <div className="form-grid">
              <label htmlFor="snap-date">Date<input id="snap-date" type="date" {...snapForm.register("snapshotDate")} /></label>
              <label htmlFor="snap-liquid">Liquid<input id="snap-liquid" type="number" step="0.01" placeholder="0" {...snapForm.register("liquid")} /></label>
            </div>
            <div className="row-actions">
              <button type="submit" disabled={!txQuery.isSuccess || !stylesQuery.isSuccess}>Add</button>
            </div>
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
