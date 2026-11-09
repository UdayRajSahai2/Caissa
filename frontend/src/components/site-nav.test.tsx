import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { SignInDialogProvider } from "@/components/sign-in-dialog";
import { SiteNav } from "@/components/site-nav";
import { messages } from "@/messages/en";

const nav = { pathname: "/", search: "", params: {} as Record<string, string> };
const session = { status: "unauthenticated" as "authenticated" | "unauthenticated" | "loading" };
const signOut = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => nav.params,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: session.status, data: { user: { name: "Test Player" } } }),
  signOut: (options: unknown) => signOut(options),
  signIn: vi.fn(),
  getProviders: () => Promise.resolve({ github: { id: "github", name: "GitHub" } }),
}));

function links() {
  return within(screen.getByRole("navigation", { name: messages.navLabel })).getAllByRole("link");
}

beforeEach(() => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(new Response(JSON.stringify({ players: ["hikaru"] }), { headers: { "content-type": "application/json" } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  nav.pathname = "/";
  nav.search = "";
  nav.params = {};
  session.status = "unauthenticated";
  signOut.mockClear();
});

describe("SiteNav", () => {
  it("shows Analyze, Learn, and Sign in to a signed-out visitor; Sign in opens the dialog in place", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <SignInDialogProvider>
        <SiteNav />
      </SignInDialogProvider>,
    );
    expect(links().map((link) => link.textContent)).toEqual([messages.navAnalyze, messages.navLearn]);
    expect(screen.getByRole("link", { name: messages.navAnalyze })).toHaveAttribute("aria-current", "page");
    const signIn = screen.getByRole("link", { name: messages.signIn });
    expect(signIn).toHaveAttribute("href", "/signin?callbackUrl=%2F");
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    await user.click(signIn);
    expect(screen.getByRole("dialog", { name: messages.signInTitle })).toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: /Account menu/ })).not.toBeInTheDocument();
  });

  it("adds My games and Puzzles for the player in the URL and marks the current view", () => {
    session.status = "authenticated";
    nav.pathname = "/player/hikaru";
    nav.search = "view=puzzles";
    nav.params = { username: "hikaru" };
    render(<SiteNav />);
    expect(links().map((link) => link.textContent)).toEqual([
      messages.navAnalyze,
      messages.navGames,
      messages.navPuzzles,
      messages.navLearn,
    ]);
    expect(screen.getByRole("link", { name: messages.navPuzzles })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: messages.navGames })).toHaveAttribute("href", "/player/hikaru/games");
    expect(screen.getByRole("search", { name: messages.headerSearchLabel })).toBeInTheDocument();
  });

  it("uses the first verified account on pages without a player, and shows the avatar menu instead of links", async () => {
    session.status = "authenticated";
    nav.pathname = "/learn";
    render(<SiteNav />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: messages.navGames })).toHaveAttribute("href", "/player/hikaru/games"),
    );
    expect(screen.getByRole("link", { name: messages.navLearn })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: messages.signIn })).not.toBeInTheDocument();
    const avatar = screen.getByRole("button", { name: "Account menu for Test Player" });
    expect(avatar).toHaveTextContent("TP");
    await userEvent.setup({ delay: null }).click(avatar);
    screen.getByRole("button", { name: messages.signOut }).click();
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("ignores an invalid name in the URL", () => {
    nav.pathname = "/player/x";
    nav.params = { username: "x" };
    render(<SiteNav />);
    expect(screen.queryByRole("link", { name: messages.navGames })).not.toBeInTheDocument();
  });
});
