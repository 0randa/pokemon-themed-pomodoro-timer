import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/victory-sound", () => ({
  playVictorySound: vi.fn(),
  stopVictorySound: vi.fn(),
  playBreakMusic: vi.fn(),
  pauseBreakMusic: vi.fn(),
  resumeBreakMusic: vi.fn(),
  stopBreakMusic: vi.fn(),
  stopAllAudio: vi.fn(),
  playHealSound: vi.fn(),
  getMuted: vi.fn(() => false),
  setMuted: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  TIMER_NOTIFICATION_TAGS: {
    pomodoroFocus: "pomopet-focus-complete",
    pomodoroBreak: "pomopet-break-complete",
  },
  cancelTimerNotifications: vi.fn(() => Promise.resolve(false)),
  requestNotificationPermission: vi.fn(() => Promise.resolve(true)),
  scheduleTimerNotification: vi.fn(() => Promise.resolve(false)),
  sendTimerNotification: vi.fn(() => false),
  supportsScheduledTimerNotifications: vi.fn(() => false),
}));

vi.mock("@/lib/session-storage", () => ({
  loadSessionData: vi.fn(() => null),
  saveSessionData: vi.fn(),
}));

import TimerComp from "@/components/timer";
import { playVictorySound } from "@/lib/victory-sound";
import { sendTimerNotification } from "@/lib/notifications";

describe("TimerComp – focus completion sound", () => {
  let visibilityState = "visible";
  let hasFocus = true;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    visibilityState = "visible";
    hasFocus = true;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => hasFocus,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    visibilityState = "visible";
    hasFocus = true;
  });

  test("plays victory sound on foreground focus completion", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TimerComp testingMode />);

    await user.click(screen.getByRole("button", { name: "Start" }));

    act(() => { vi.advanceTimersByTime(3000); });

    await waitFor(() => {
      expect(playVictorySound).toHaveBeenCalled();
    });
  });

  test("plays victory sound even when page is backgrounded", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TimerComp testingMode />);

    await user.click(screen.getByRole("button", { name: "Start" }));

    // Simulate backgrounding before timer expires
    visibilityState = "hidden";
    hasFocus = false;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));

    act(() => { vi.advanceTimersByTime(3000); });

    // Return to foreground so the completion effect fires
    visibilityState = "visible";
    hasFocus = true;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(playVictorySound).toHaveBeenCalled();
    });
  });

  test("sends notification for background completion", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TimerComp testingMode />);

    await user.click(screen.getByRole("button", { name: "Start" }));

    visibilityState = "hidden";
    hasFocus = false;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));

    act(() => { vi.advanceTimersByTime(3000); });

    visibilityState = "visible";
    hasFocus = true;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(sendTimerNotification).toHaveBeenCalledWith(
        "Focus session complete!",
        "Great work, Trainer! Time to take a break.",
      );
    });
  });
});
