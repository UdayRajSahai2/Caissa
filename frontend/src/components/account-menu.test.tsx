import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu, initials } from "@/components/account-menu";
import { messages } from "@/messages/en";

const session = { name: "Uday Raj Sahai" as string | null };
const signOut = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { name: session.name } } }),
  signOut: (options: unknown) => signOut(options),
}));

afterEach(() => {
  session.name = "Uday Raj Sahai";
  signOut.mockClear();
});

describe("initials", () => {
  it("takes the first and last word, ignoring punctuation, and handles odd names", () => {
    expect(initials("Uday Raj Sahai")).toBe("US");
    expect(initials("magnus")).toBe("M");
    expect(initials("  ")).toBeNull();
    expect(initials(null)).toBeNull();
    expect(initials("(Ana) García")).toBe("AG");
  });
});

describe("AccountMenu", () => {
  it("shows initials on a named avatar and opens a small panel with the account page and Sign out", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AccountMenu />);
    const avatar = screen.getByRole("button", { name: "Account menu for Uday Raj Sahai" });
    expect(avatar).toHaveTextContent("US");
    expect(avatar).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: messages.accountMenuAccounts })).not.toBeInTheDocument();

    await user.click(avatar);
    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: messages.accountMenuAccounts })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("link", { name: messages.progressTitle })).toHaveAttribute("href", "/progress");
    await user.click(screen.getByRole("button", { name: messages.signOut }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("closes on Escape and gives focus back to the avatar, and closes on a click outside", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <>
        <AccountMenu />
        <p>Outside</p>
      </>,
    );
    const avatar = screen.getByRole("button", { name: /Account menu/ });
    await user.click(avatar);
    await user.tab();
    expect(screen.getByRole("link", { name: messages.progressTitle })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(avatar).toHaveAttribute("aria-expanded", "false");
    expect(avatar).toHaveFocus();

    await user.click(avatar);
    await user.click(screen.getByText("Outside"));
    expect(avatar).toHaveAttribute("aria-expanded", "false");
  });

  it("falls back to an icon and a plain name when the account has no display name", () => {
    session.name = null;
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: messages.accountMenu })).toBeInTheDocument();
  });
});
