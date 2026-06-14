import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const logoutMutate = vi.fn();
const changePasswordMutate = vi.fn();

vi.mock("./useLogoutMutation", () => ({
  useLogoutMutation: () => ({ mutate: logoutMutate, isPending: false })
}));

vi.mock("./useChangePasswordMutation", () => ({
  useChangePasswordMutation: () => ({
    mutate: changePasswordMutate,
    isPending: false,
    error: null
  })
}));

import { AccountMenu } from "./AccountMenu";

describe("AccountMenu", () => {
  beforeEach(() => {
    logoutMutate.mockClear();
    changePasswordMutate.mockClear();
  });

  test("trigger is a real button reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);

    const trigger = screen.getByRole("button", { name: /account/i });
    await user.tab();
    expect(trigger).toHaveFocus();
  });

  test("opens menu with keyboard and exposes menu items", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.tab();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });
    expect(screen.getByRole("menuitem", { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
  });

  test("Escape closes the menu", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.tab();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  test("Log out item triggers logout", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole("button", { name: /account/i }));
    await user.click(screen.getByRole("menuitem", { name: /log out/i }));

    expect(logoutMutate).toHaveBeenCalledTimes(1);
  });

  test("Change password item reveals the form outside the menu", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole("button", { name: /account/i }));
    await user.click(screen.getByRole("menuitem", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });
});
