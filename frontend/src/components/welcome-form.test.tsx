import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WelcomeForm } from "@/components/welcome-form";
import { messages } from "@/messages/en";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const assign = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockClear();
});

function stubLocation() {
  vi.stubGlobal("location", { ...window.location, assign });
}

describe("WelcomeForm (AUTH-06)", () => {
  it("saves the username, then opens the user's analysis", async () => {
    const user = userEvent.setup({ delay: null });
    stubLocation();
    const fetchMock = vi.fn((_input: RequestInfo, _init?: RequestInit) => Promise.resolve(json({ players: ["magnus"] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<WelcomeForm initialUsername="" next="/progress" />);
    await user.type(screen.getByLabelText(messages.welcomeLabel), "Magnus");
    await user.click(screen.getByRole("button", { name: messages.welcomeContinue }));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/caissa/me/players/Magnus/save");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(assign).toHaveBeenCalledWith("/player/Magnus");
  });

  it("goes back to the player page the user was heading to", async () => {
    const user = userEvent.setup({ delay: null });
    stubLocation();
    vi.stubGlobal("fetch", () => Promise.resolve(json({ players: ["hikaru"] })));
    render(<WelcomeForm initialUsername="hikaru" next="/player/hikaru/games" />);
    expect(screen.getByLabelText(messages.welcomeLabel)).toHaveValue("hikaru");
    await user.click(screen.getByRole("button", { name: messages.welcomeContinue }));
    expect(assign).toHaveBeenCalledWith("/player/hikaru/games");
  });

  it("shows why a name was refused and keeps focus in the field", async () => {
    const user = userEvent.setup({ delay: null });
    stubLocation();
    vi.stubGlobal("fetch", () =>
      Promise.resolve(json({ detail: "No Chess.com account was found for that username. Check the spelling." }, 404)),
    );
    render(<WelcomeForm initialUsername="nobody123" next={null} />);
    await user.click(screen.getByRole("button", { name: messages.welcomeContinue }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No Chess.com account was found");
    expect(screen.getByLabelText(messages.welcomeLabel)).toHaveFocus();
    expect(assign).not.toHaveBeenCalled();
  });

  it("checks the name before calling the API", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<WelcomeForm initialUsername="a b" next={null} />);
    await user.click(screen.getByRole("button", { name: messages.welcomeContinue }));
    expect(await screen.findByRole("alert")).toHaveTextContent("3 to 25 characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
