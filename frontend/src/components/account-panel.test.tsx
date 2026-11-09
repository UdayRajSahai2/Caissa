import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountPanel } from "@/components/account-panel";
import { messages } from "@/messages/en";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: null }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountPanel", () => {
  it("saves a username, lists it with an analysis link, and removes it", async () => {
    const user = userEvent.setup({ delay: null });
    let list: string[] = [];
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/save")) {
        list = ["magnus"];
        return Promise.resolve(json({ players: list }));
      }
      if (url.endsWith("/remove")) {
        list = [];
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(json({ players: list }));
    });
    render(<AccountPanel initialUsername="Magnus" />);

    expect(await screen.findByText(messages.accountNone)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.usernameLabel)).toHaveValue("Magnus");
    await user.click(screen.getByRole("button", { name: messages.accountSave }));

    expect(await screen.findByText("magnus is saved.")).toBeInTheDocument();
    expect(screen.getByLabelText(messages.usernameLabel)).toHaveValue("");
    const saved = await screen.findByRole("list");
    await waitFor(() => expect(within(saved).getByText("magnus")).toBeInTheDocument());
    expect(within(saved).getByRole("link", { name: messages.accountOpen })).toHaveAttribute("href", "/player/magnus");
    expect(calls).toContain("POST /api/caissa/me/players/Magnus/save");

    await user.click(screen.getByRole("button", { name: "Remove magnus from your list" }));
    expect(await screen.findByText(messages.accountNone)).toBeInTheDocument();
    expect(calls).toContain("POST /api/caissa/me/players/magnus/remove");
  });

  it("shows the API's reason when the account does not exist on Chess.com", async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal("fetch", (input: RequestInfo) =>
      Promise.resolve(
        String(input).endsWith("/me/players")
          ? json({ players: [] })
          : json({ detail: "No Chess.com account was found for that username. Check the spelling." }, 404),
      ),
    );
    render(<AccountPanel initialUsername="nobody123" />);
    await user.click(screen.getByRole("button", { name: messages.accountSave }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No Chess.com account was found");
    expect(screen.getByLabelText(messages.usernameLabel)).toHaveValue("nobody123");
  });

  it("checks the username before calling the API", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = vi.fn((input: RequestInfo) =>
      Promise.resolve(String(input).endsWith("/me/players") ? json({ players: [] }) : json({}, 500)),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPanel initialUsername="" />);
    await user.type(screen.getByLabelText(messages.usernameLabel), "a b");
    await user.click(screen.getByRole("button", { name: messages.accountSave }));
    expect(await screen.findByRole("alert")).toHaveTextContent("3 to 25 characters");
    expect(fetchMock.mock.calls.every(([input]) => String(input).endsWith("/me/players"))).toBe(true);
  });
});
