import { afterEach, describe, expect, test, vi } from "vitest";
import {
  TIMER_NOTIFICATION_TAGS,
  cancelTimerNotifications,
  requestNotificationPermission,
  scheduleTimerNotification,
  sendTimerNotification,
  supportsScheduledTimerNotifications,
} from "@/lib/notifications";

describe("notifications", () => {
  const originalServiceWorker = navigator.serviceWorker;
  const originalTimestampTrigger = globalThis.TimestampTrigger;

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
    if (originalTimestampTrigger === undefined) {
      delete globalThis.TimestampTrigger;
    } else {
      globalThis.TimestampTrigger = originalTimestampTrigger;
    }
  });

  test("requestNotificationPermission reflects the live browser result", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");

    function MockNotification() {
      return { close: vi.fn() };
    }

    MockNotification.permission = "default";
    MockNotification.requestPermission = requestPermission;

    vi.stubGlobal("Notification", MockNotification);

    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  test("sendTimerNotification uses the current Notification.permission value", () => {
    const created = [];

    function MockNotification(title, options) {
      created.push({ title, options });
      return { close: vi.fn() };
    }

    MockNotification.permission = "default";
    MockNotification.requestPermission = vi.fn();

    vi.stubGlobal("Notification", MockNotification);

    expect(sendTimerNotification("Focus session complete!", "Break time.")).toBe(false);
    expect(created).toHaveLength(0);

    MockNotification.permission = "granted";

    expect(sendTimerNotification("Focus session complete!", "Break time.")).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: "Focus session complete!",
      options: expect.objectContaining({
        body: "Break time.",
        tag: "pomopet-timer",
        renotify: true,
      }),
    });
  });

  test("supports scheduled timer notifications when service worker triggers are available", () => {
    function MockNotification() {}

    MockNotification.permission = "granted";
    MockNotification.requestPermission = vi.fn();
    MockNotification.prototype.showTrigger = null;

    vi.stubGlobal("Notification", MockNotification);
    globalThis.TimestampTrigger = class MockTimestampTrigger {};

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(),
        register: vi.fn(),
        ready: Promise.resolve(null),
      },
    });

    expect(supportsScheduledTimerNotifications()).toBe(true);
  });

  test("scheduleTimerNotification registers the worker and schedules a triggered notification", async () => {
    class MockTimestampTrigger {
      constructor(timestamp) {
        this.timestamp = timestamp;
      }
    }

    function MockNotification() {}

    MockNotification.permission = "granted";
    MockNotification.requestPermission = vi.fn();
    MockNotification.prototype.showTrigger = null;

    const registration = {
      showNotification: vi.fn().mockResolvedValue(undefined),
      getNotifications: vi.fn().mockResolvedValue([]),
    };

    vi.stubGlobal("Notification", MockNotification);
    globalThis.TimestampTrigger = MockTimestampTrigger;

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(null),
        register: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    });

    await expect(
      scheduleTimerNotification({
        tag: TIMER_NOTIFICATION_TAGS.pomodoroFocus,
        title: "Focus session complete!",
        body: "Break time.",
        timestamp: 12_345,
      }),
    ).resolves.toBe(true);

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/pomopet-sw.js", { scope: "/" });
    expect(registration.showNotification).toHaveBeenCalledWith(
      "Focus session complete!",
      expect.objectContaining({
        body: "Break time.",
        tag: TIMER_NOTIFICATION_TAGS.pomodoroFocus,
        timestamp: 12_345,
        renotify: true,
        requireInteraction: true,
        showTrigger: expect.objectContaining({ timestamp: 12_345 }),
      }),
    );
  });

  test("cancelTimerNotifications closes scheduled notifications for each tag", async () => {
    const closeFocus = vi.fn();
    const closeBreak = vi.fn();

    const registration = {
      showNotification: vi.fn(),
      getNotifications: vi
        .fn()
        .mockResolvedValueOnce([{ close: closeFocus }])
        .mockResolvedValueOnce([{ close: closeBreak }]),
    };

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
        register: vi.fn(),
        ready: Promise.resolve(registration),
      },
    });

    await expect(
      cancelTimerNotifications([
        TIMER_NOTIFICATION_TAGS.pomodoroFocus,
        TIMER_NOTIFICATION_TAGS.pomodoroBreak,
      ]),
    ).resolves.toBe(true);

    expect(registration.getNotifications).toHaveBeenNthCalledWith(1, {
      tag: TIMER_NOTIFICATION_TAGS.pomodoroFocus,
      includeTriggered: true,
    });
    expect(registration.getNotifications).toHaveBeenNthCalledWith(2, {
      tag: TIMER_NOTIFICATION_TAGS.pomodoroBreak,
      includeTriggered: true,
    });
    expect(closeFocus).toHaveBeenCalledTimes(1);
    expect(closeBreak).toHaveBeenCalledTimes(1);
  });
});
