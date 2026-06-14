import { describe, expect, test, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";

vi.mock("react-chartjs-2", () => ({
  Pie: () => null,
  Bar: () => null,
  Line: () => null,
  Doughnut: () => null
}));

import { createAppRouter } from "./router.tsx";
import { resetTestState, testState } from "./test-msw.ts";

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ["/"] })
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetTestState();
});

describe("Login form (unauthenticated state)", () => {
  test("renders money heading and login form when not authenticated", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "money" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  test("rejects empty submit (zod email() invalid)", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: /sign in/i });
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(testState.authenticated).toBe(false);
  });

  test("shows server error message on wrong credentials", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByLabelText("Email");
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "WrongPassword!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  test("transitions to dashboard on successful login", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByLabelText("Email");
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});

describe("Dashboard panel (authenticated state)", () => {
  beforeEach(() => {
    testState.authenticated = true;
  });

  test("renders all stat cards in default empty state", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Total invested" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Total PnL" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Assets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monthly net" })).toBeInTheDocument();
  });

  test("nav exposes all top-level sections", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    for (const item of ["dashboard", "transactions", "movements", "snapshots", "settings"]) {
      expect(screen.getByRole("link", { name: item })).toBeInTheDocument();
    }
  });

  test("switches to transactions panel on nav click", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    expect(await screen.findByRole("heading", { name: "Transactions" })).toBeInTheDocument();
  });

  test("aggregates transaction totals in stats", async () => {
    testState.transactions = [
      {
        id: "tx-1",
        txDate: "2026-05-16",
        asset: "ETF-A",
        tipo: "nuovo vincolo",
        derivedType: "buy",
        buyValue: 1000,
        pnl: 50,
        currentValue: 1050,
        note: ""
      },
      {
        id: "tx-2",
        txDate: "2026-05-17",
        asset: "ETF-B",
        tipo: "cedola",
        derivedType: "return",
        buyValue: 0,
        pnl: 25,
        currentValue: 25,
        note: ""
      }
    ];
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    });
    const txCard = screen.getByRole("heading", { name: "Transactions" }).parentElement;
    expect(txCard?.textContent).toMatch(/2/);
  });

  test("uses Italian currency formatting (PR #13 hoisted Intl)", async () => {
    testState.transactions = [
      {
        id: "tx-1",
        txDate: "2026-05-16",
        asset: "ETF-A",
        tipo: "nuovo vincolo",
        derivedType: "buy",
        buyValue: 1234,
        pnl: 0,
        currentValue: 1234,
        note: ""
      }
    ];
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await waitFor(() => {
      expect(screen.getAllByText(/1234,00|1\.234,00/).length).toBeGreaterThan(0);
    });
  });
});

describe("Transactions form dynamic fields (issue #51)", () => {
  beforeEach(() => {
    testState.authenticated = true;
  });

  test("tipo is a select with known options", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    const tipoTrigger = await screen.findByLabelText("Tipo");
    await user.click(tipoTrigger);
    const optionNames = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(optionNames).toEqual(["nuovo vincolo", "cedola", "interessi", "cashback", "Variazione Valore"]);
  });

  test("default tipo 'nuovo vincolo' shows Buy value, hides PnL", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    await screen.findByLabelText("Tipo");
    expect(screen.getByLabelText("Buy value")).toBeInTheDocument();
    expect(screen.queryByLabelText("PnL")).toBeNull();
  });

  test("switching to 'cedola' hides Buy value, shows PnL", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    const tipoTrigger = await screen.findByLabelText("Tipo");
    await user.click(tipoTrigger);
    await user.click(await screen.findByRole("option", { name: "cedola" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Buy value")).toBeNull();
      expect(screen.getByLabelText("PnL")).toBeInTheDocument();
    });
  });

  test("asset combobox keyboard nav: ArrowDown + Enter selects an option", async () => {
    testState.transactions = [
      { id: "tx-1", txDate: "2026-05-16", asset: "ETF-A", tipo: "nuovo vincolo", derivedType: "buy", buyValue: 1000, pnl: 0, currentValue: 1000, note: "" },
      { id: "tx-2", txDate: "2026-05-17", asset: "ETF-B", tipo: "cedola", derivedType: "return", buyValue: 0, pnl: 25, currentValue: 25, note: "" }
    ];
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    const assetInput = (await screen.findByRole("combobox", { name: "Asset" })) as HTMLInputElement;
    assetInput.focus();
    await waitFor(() => expect(screen.getByRole("option", { name: "ETF-A" })).toBeInTheDocument());
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(assetInput.value).toBe("ETF-B");
  });

  test("asset combobox Escape closes the list", async () => {
    testState.transactions = [
      { id: "tx-1", txDate: "2026-05-16", asset: "ETF-A", tipo: "nuovo vincolo", derivedType: "buy", buyValue: 1000, pnl: 0, currentValue: 1000, note: "" }
    ];
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    const assetInput = (await screen.findByRole("combobox", { name: "Asset" })) as HTMLInputElement;
    assetInput.focus();
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  test("asset combobox shows existing assets and selects on click", async () => {
    testState.transactions = [
      { id: "tx-1", txDate: "2026-05-16", asset: "ETF-A", tipo: "nuovo vincolo", derivedType: "buy", buyValue: 1000, pnl: 0, currentValue: 1000, note: "" },
      { id: "tx-2", txDate: "2026-05-17", asset: "ETF-B", tipo: "cedola", derivedType: "return", buyValue: 0, pnl: 25, currentValue: 25, note: "" }
    ];
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    const assetInput = await screen.findByRole("combobox", { name: "Asset" });
    await user.click(assetInput);
    const optionA = await screen.findByRole("option", { name: "ETF-A" });
    expect(optionA).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ETF-B" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "ETF-A" }));
    expect((assetInput as HTMLInputElement).value).toBe("ETF-A");
  });
});

describe("Snapshot auto-derive (issue #51)", () => {
  beforeEach(() => {
    testState.authenticated = true;
  });

  test("risk fields are hidden in the form (auto-computed at submit)", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "snapshots" }));
    await screen.findByRole("heading", { name: "Monthly snapshots" });
    expect(screen.queryByLabelText("Low risk")).toBeNull();
    expect(screen.queryByLabelText("Medium risk")).toBeNull();
    expect(screen.queryByLabelText("High risk")).toBeNull();
    expect(screen.queryByRole("button", { name: /calcola da portafoglio/i })).toBeNull();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Liquid")).toBeInTheDocument();
  });

  test("submit derives risk totals from current transactions + styles", async () => {
    testState.transactions = [
      { id: "tx-1", txDate: "2026-05-16", asset: "ETF-A", tipo: "nuovo vincolo", derivedType: "buy", buyValue: 1000, pnl: 50, currentValue: 1050, note: "" },
      { id: "tx-2", txDate: "2026-05-17", asset: "ETF-B", tipo: "cedola", derivedType: "return", buyValue: 0, pnl: 25, currentValue: 25, note: "" }
    ];
    testState.styles = {
      "ETF-A": { colorHex: null, riskLevel: "medium" },
      "ETF-B": { colorHex: null, riskLevel: "high" }
    };
    let captured: unknown = null;
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith("/api/v1/monthly-snapshots") && init?.method === "POST") {
          captured = JSON.parse(String(init.body));
        }
        return origFetch(input as RequestInfo, init);
      };
      const user = userEvent.setup();
      renderApp();
      await screen.findByRole("heading", { name: "Dashboard" });
      await user.click(screen.getByRole("link", { name: "snapshots" }));
      await screen.findByRole("heading", { name: "Monthly snapshots" });
      await user.click(screen.getByRole("button", { name: "Add" }));
      await waitFor(() => {
        expect(captured).not.toBeNull();
      });
      const body = captured as { lowRisk: number; mediumRisk: number; highRisk: number };
      expect(body.lowRisk).toBe(0);
      expect(body.mediumRisk).toBe(1050);
      expect(body.highRisk).toBe(25);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("Empty number inputs (placeholder, no inserted 0)", () => {
  beforeEach(() => {
    testState.authenticated = true;
  });

  test("tx Buy value is empty with placeholder '0'", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "transactions" }));
    const buy = (await screen.findByLabelText("Buy value")) as HTMLInputElement;
    expect(buy.value).toBe("");
    expect(buy.placeholder).toBe("0");
  });

  test("submitting tx with empty Buy value sends 0 to backend (zod coerce)", async () => {
    let captured: { buyValue?: number } | null = null;
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith("/api/v1/transactions") && init?.method === "POST") {
          captured = JSON.parse(String(init.body));
        }
        return origFetch(input as RequestInfo, init);
      };
      const user = userEvent.setup();
      renderApp();
      await screen.findByRole("heading", { name: "Dashboard" });
      await user.click(screen.getByRole("link", { name: "transactions" }));
      await screen.findByLabelText("Buy value");
      await user.type(screen.getByRole("combobox", { name: "Asset" }), "TEST");
      await user.click(screen.getByRole("button", { name: "Add" }));
      await waitFor(() => {
        expect(captured).not.toBeNull();
      });
      expect((captured as unknown as { buyValue: number }).buyValue).toBe(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("mm Amount and snapshot Liquid are empty with placeholder '0'", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "movements" }));
    const amount = (await screen.findByLabelText("Amount")) as HTMLInputElement;
    expect(amount.value).toBe("");
    expect(amount.placeholder).toBe("0");
    await user.click(screen.getByRole("link", { name: "snapshots" }));
    const liquid = (await screen.findByLabelText("Liquid")) as HTMLInputElement;
    expect(liquid.value).toBe("");
    expect(liquid.placeholder).toBe("0");
  });
});

describe("Snapshot table is add/delete-only (no edit)", () => {
  beforeEach(() => {
    testState.authenticated = true;
    testState.snapshots = [
      { id: "snap-1", snapshotDate: "2026-05-01", lowRisk: 100, mediumRisk: 200, highRisk: 50, liquid: 30 }
    ];
  });

  test("snapshot row has Delete but no Edit", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("link", { name: "snapshots" }));
    await screen.findByRole("heading", { name: "Monthly snapshots" });
    const rowActions = document.querySelectorAll("table tbody tr td:last-child button");
    const labels = Array.from(rowActions).map((b) => b.textContent);
    expect(labels).toContain("Delete");
    expect(labels).not.toContain("Edit");
  });
});

describe("Logout flow", () => {
  test("logout button transitions back to login screen", async () => {
    const user = userEvent.setup();
    testState.authenticated = true;
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(await screen.findByRole("menuitem", { name: /log out/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "money" })).toBeInTheDocument();
    });
  });
});
