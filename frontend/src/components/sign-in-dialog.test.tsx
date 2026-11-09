import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInDialogProvider, useSignIn } from "@/components/sign-in-dialog";
import { messages } from "@/messages/en";

const providers = { list: { github: { id: "github", name: "GitHub" } } as Record<string, { id: string; name: string }> | null };
const signIn = vi.fn();

vi.mock("next-auth/react", () => ({
  getProviders: () => Promise.resolve(providers.list),
  signIn: (id: string, options: unknown) => signIn(id, options),
}));

function Opener({ target }: { target: string }) {
  const open = useSignIn();
  return (
    <button type="button" onClick={() => open(target)}>
      Open
    </button>
  );
}

afterEach(() => {
  providers.list = { github: { id: "github", name: "GitHub" } };
  signIn.mockClear();
});

describe("SignInDialog", () => {
  it("opens as a labeled dialog, lists the providers, and returns to the page that asked", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <SignInDialogProvider>
        <Opener target="/player/hikaru" />
      </SignInDialogProvider>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).not.toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: messages.signInTitle })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Continue with GitHub" }));
    expect(signIn).toHaveBeenCalledWith("github", { callbackUrl: "/welcome?next=%2Fplayer%2Fhikaru" });

    await user.click(screen.getByRole("button", { name: messages.signInClose }));
    expect(dialog).not.toHaveAttribute("open");
  });

  it("never returns to another site", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <SignInDialogProvider>
        <Opener target="https://evil.example/" />
      </SignInDialogProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Continue with GitHub" }));
    expect(signIn).toHaveBeenCalledWith("github", { callbackUrl: "/welcome?next=%2Faccount" });
  });

  it("says so when no sign-in provider is set up", async () => {
    providers.list = {};
    const user = userEvent.setup({ delay: null });
    render(
      <SignInDialogProvider>
        <Opener target="/" />
      </SignInDialogProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.signInUnavailable);
  });
});
