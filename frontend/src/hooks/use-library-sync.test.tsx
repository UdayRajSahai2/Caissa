import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLibrarySync } from "@/hooks/use-library-sync";
import { messages } from "@/messages/en";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function Probe() {
  const sync = useLibrarySync("hikaru");
  return (
    <p data-testid="sync">
      {sync.phase}|{sync.message ?? ""}|{sync.refreshKey}
    </p>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLibrarySync", () => {
  it("is ready at once when the games are already stored and current", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(json({ status: "ready", username: "hikaru" })));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent("ready||0"));
  });

  it("shows saved games while refreshing, then signals new games with a fresh key", async () => {
    const job: { finish?: () => void } = {};
    vi.stubGlobal("fetch", (input: RequestInfo) =>
      String(input).includes("/jobs/")
        ? new Promise<Response>((resolve) => {
            job.finish = () => resolve(json({ status: "succeeded", error_message: null }));
          })
        : Promise.resolve(json({ status: "refreshing", job_id: "job-1", username: "hikaru" })),
    );
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent(`refreshing|${messages.gamesRefreshing}|0`));
    await waitFor(() => expect(job.finish).toBeDefined());
    job.finish?.();
    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent("ready||1"));
  });

  it("keeps saved games when the refresh fails", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo) =>
      Promise.resolve(
        String(input).includes("/jobs/")
          ? json({ status: "failed", error_message: "Chess.com did not answer." })
          : json({ status: "refreshing", job_id: "job-1", username: "hikaru" }),
      ),
    );
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent(`ready|${messages.gamesRefreshFailed}|0`));
  });

  it("fails with the job's message when a first download fails", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo) =>
      Promise.resolve(
        String(input).includes("/jobs/")
          ? json({ status: "failed", error_message: "We could not find that Chess.com player." })
          : json({ status: "queued", job_id: "job-1", username: "hikaru" }),
      ),
    );
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("sync")).toHaveTextContent("failed|We could not find that Chess.com player.|0"),
    );
  });

  it("shows the server's message for a refused request and a plain one when unreachable", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(json({ detail: "Too many requests. Try again shortly." }, 429)));
    const { unmount } = render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("sync")).toHaveTextContent("failed|Too many requests. Try again shortly.|0"),
    );
    unmount();
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent(`failed|${messages.analyzeUnreachable}|0`));
  });

  it("tells a signed-out user to sign in again, with no download started", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(json({ detail: "Sign in to use Caissa." }, 401)));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent("signed-out||0"));
  });
});
