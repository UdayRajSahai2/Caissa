import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInDialogProvider } from "@/components/sign-in-dialog";
import { UsernameForm } from "@/components/username-form";
import { messages } from "@/messages/en";

const push = vi.fn();

const session = { status: "authenticated" as "authenticated" | "unauthenticated" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: session.status, data: null }),
  signIn: vi.fn(),
  getProviders: () => Promise.resolve({ github: { id: "github", name: "GitHub" } }),
}));

beforeEach(() => {
  push.mockClear();
  session.status = "authenticated";
});

describe("UsernameForm", () => {
  it("opens the player's analysis page for a valid name, trimmed", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<UsernameForm />);
    await user.type(screen.getByLabelText(messages.usernameLabel), "  hikaru  ");
    await user.click(screen.getByRole("button", { name: messages.analyze }));

    expect(push).toHaveBeenCalledWith("/player/hikaru");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects an empty, short, or hostile name without navigating", async () => {
    const user = userEvent.setup();
    render(<UsernameForm />);
    const field = screen.getByLabelText(messages.usernameLabel);
    const submit = screen.getByRole("button", { name: messages.analyze });

    await user.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("3 to 25 characters");
    expect(field).toHaveAttribute("aria-invalid", "true");

    for (const bad of ["ab", "<script>alert(1)</script>", "a".repeat(26)]) {
      await user.clear(field);
      await user.type(field, bad);
      await user.click(submit);
      expect(screen.getByRole("alert")).toHaveTextContent("3 to 25 characters");
    }
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText("<script>alert(1)</script>")).not.toBeInTheDocument();
  });

  it("clears the error as soon as the name is edited", async () => {
    const user = userEvent.setup();
    render(<UsernameForm />);
    await user.click(screen.getByRole("button", { name: messages.analyze }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.type(screen.getByLabelText(messages.usernameLabel), "h");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a compact, labeled search for the header", async () => {
    const user = userEvent.setup();
    render(<UsernameForm variant="compact" />);
    const search = screen.getByRole("search", { name: messages.headerSearchLabel });
    expect(search).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: messages.headerSearchButton }));
    expect(screen.getByRole("alert")).toHaveTextContent("3 to 25 characters");
    expect(screen.getByLabelText(messages.usernameLabel)).toHaveAccessibleDescription(/3 to 25 characters/);

    await user.type(screen.getByLabelText(messages.usernameLabel), "Magnus_C-1{Enter}");
    expect(push).toHaveBeenCalledWith("/player/Magnus_C-1");
  });

  it("asks a signed-out visitor to sign in first, in a dialog, instead of navigating", async () => {
    session.status = "unauthenticated";
    const user = userEvent.setup();
    render(
      <SignInDialogProvider>
        <UsernameForm />
      </SignInDialogProvider>,
    );
    await user.type(screen.getByLabelText(messages.usernameLabel), "hikaru");
    await user.click(screen.getByRole("button", { name: messages.analyze }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: messages.signInTitle })).toHaveAttribute("open");
  });
});
