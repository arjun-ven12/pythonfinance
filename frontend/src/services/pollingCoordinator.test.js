import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetPollingCoordinatorForTests,
  getPollingDiagnostics,
  subscribePollingChannel,
} from "./pollingCoordinator";

afterEach(() => {
  __resetPollingCoordinatorForTests();
  vi.useRealTimers();
});

describe("pollingCoordinator", () => {
  it("shares one interval and cleans it up after the final subscriber", async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockResolvedValue({ ok: true });
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = subscribePollingChannel("system-health", first, {
      intervalMs: 1_000,
      poll,
    });
    const unsubscribeSecond = subscribePollingChannel("system-health", second, {
      intervalMs: 1_000,
      poll,
    });
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);

    expect(poll).toHaveBeenCalledTimes(1);
    expect(getPollingDiagnostics()).toMatchObject({
      activeChannels: 1,
      activeSubscribers: 2,
    });
    unsubscribeFirst();
    expect(getPollingDiagnostics().activeChannels).toBe(1);
    unsubscribeSecond();
    expect(getPollingDiagnostics().activeChannels).toBe(0);
  });
});
