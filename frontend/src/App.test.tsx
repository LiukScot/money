import { describe, expect, test, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-chartjs-2", () => ({
  Pie: () => null,
  Bar: () => null,
  Line: () => null,
  Doughnut: () => null
}));

import App from "./App.tsx";
import { resetTestState, testState } from "./test-msw.ts";

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetTestState();
});

describe("Login form (unauthenticated state)", () => {
  test("renders myMoney heading and login form when not authenticated", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "myMoney" })).toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: item })).toBeInTheDocument();
    }
  });

  test("switches to transactions panel on nav click", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByRole("button", { name: "transactions" }));
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

describe("Logout flow", () => {
  test("logout button transitions back to login screen", async () => {
    const user = userEvent.setup();
    testState.authenticated = true;
    renderApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.click(screen.getByText("Account"));
    await user.click(screen.getByRole("button", { name: /log out/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "myMoney" })).toBeInTheDocument();
    });
  });
});
