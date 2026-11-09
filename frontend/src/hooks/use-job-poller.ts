"use client";

import { useCallback, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";

/** Waits between job checks: quick at first, then every 2 seconds (Section 8.3). */
const POLL_STEPS_MS = [250, 500, 1_000] as const;
const POLL_INTERVAL_MS = 2_000;

export function pollDelay(attempt: number): number {
  return POLL_STEPS_MS[attempt] ?? POLL_INTERVAL_MS;
}

export type JobPollResult =
  | { status: "succeeded" }
  | { status: "failed"; message: string | null }
  | { status: "timed_out" }
  | { status: "aborted" };

export function useJobPoller(timeoutMs: number): {
  poll: (jobId: string) => Promise<JobPollResult>;
  cancel: () => void;
} {
  const controller = useRef<AbortController | null>(null);
  const timeout = useRef(timeoutMs);
  timeout.current = timeoutMs;

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const poll = useCallback((jobId: string) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    return pollJob(jobId, timeout.current, next.signal);
  }, []);

  return { poll, cancel };
}

async function pollJob(jobId: string, timeoutMs: number, signal: AbortSignal): Promise<JobPollResult> {
  const started = Date.now();
  let attempt = 0;
  while (!signal.aborted) {
    if (Date.now() - started > timeoutMs) {
      return { status: "timed_out" };
    }
    try {
      const response = await apiFetch(`jobs/${encodeURIComponent(jobId)}`, { signal });
      if (response.ok) {
        const body: unknown = await response.json();
        const job = readJob(body);
        if (job?.status === "succeeded") {
          return { status: "succeeded" };
        }
        if (job?.status === "failed") {
          return { status: "failed", message: job.error_message };
        }
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        return { status: "aborted" };
      }
    }
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) {
      return { status: "timed_out" };
    }
    const waited = await delay(Math.min(pollDelay(attempt), remaining), signal);
    attempt += 1;
    if (!waited) {
      return { status: "aborted" };
    }
  }
  return { status: "aborted" };
}

function readJob(value: unknown): { status: string; error_message: string | null } | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const job = value as Record<string, unknown>;
  if (typeof job.status !== "string") {
    return null;
  }
  const error = job.error_message;
  if (error !== null && error !== undefined && typeof error !== "string") {
    return null;
  }
  return { status: job.status, error_message: typeof error === "string" ? error : null };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function delay(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
