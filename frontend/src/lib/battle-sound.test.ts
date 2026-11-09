import { afterEach, describe, expect, it, vi } from "vitest";
import { primeBattleSound } from "@/lib/battle-sound";

class FakeContext {
  state: "running" | "closed" = "running";
  close = vi.fn(() => {
    if (this.state === "closed") {
      return Promise.reject(new DOMException("Cannot close a closed AudioContext.", "InvalidStateError"));
    }
    this.state = "closed";
    return Promise.resolve();
  });
  resume = vi.fn(() => Promise.resolve());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("download sound", () => {
  it("can be stopped twice without closing the audio context twice", () => {
    const contexts: FakeContext[] = [];
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        const context = new FakeContext();
        contexts.push(context);
        return context;
      }),
    );
    const sound = primeBattleSound();
    sound.stop();
    sound.stop();
    expect(contexts[0]?.close).toHaveBeenCalledTimes(1);
  });
});
