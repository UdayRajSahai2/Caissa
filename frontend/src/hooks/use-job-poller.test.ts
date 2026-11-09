import { describe, expect, it } from "vitest";
import { pollDelay } from "@/hooks/use-job-poller";

describe("job polling", () => {
  it("checks quickly at first, then settles at every 2 seconds", () => {
    expect([0, 1, 2, 3, 10].map(pollDelay)).toEqual([250, 500, 1_000, 2_000, 2_000]);
  });
});
