/**
 * Browser Notification helpers for timer completion.
 * Falls back silently when the Notifications API is unavailable or denied.
 */

const TIMER_SERVICE_WORKER_URL = "/pomopet-sw.js";
const DEFAULT_NOTIFICATION_ICON = "/window.svg";
const DEFAULT_NOTIFICATION_BADGE = "/favicon.ico";

export const TIMER_NOTIFICATION_TAGS = {
  pomodoroFocus: "pomopet-focus-complete",
  pomodoroBreak: "pomopet-break-complete",
  flowBreak: "pomopet-flow-break-complete",
};

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function supportsScheduledTimerNotifications() {
  if (
    typeof window === "undefined"
    || typeof Notification === "undefined"
    || typeof navigator === "undefined"
    || !("serviceWorker" in navigator)
    || typeof TimestampTrigger !== "function"
  ) {
    return false;
  }

  return "showTrigger" in Notification.prototype;
}

async function getTimerServiceWorkerRegistration() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) {
      try {
        return await navigator.serviceWorker.ready;
      } catch {
        return existing;
      }
    }

    await navigator.serviceWorker.register(TIMER_SERVICE_WORKER_URL, { scope: "/" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function registerTimerServiceWorker() {
  return getTimerServiceWorkerRegistration();
}

export async function scheduleTimerNotification({
  tag,
  title,
  body,
  timestamp,
  data,
}) {
  if (
    !supportsScheduledTimerNotifications()
    || Notification.permission !== "granted"
    || !Number.isFinite(timestamp)
    || !tag
    || !title
  ) {
    return false;
  }

  const registration = await getTimerServiceWorkerRegistration();
  if (!registration?.showNotification) return false;

  try {
    if (registration.getNotifications) {
      const existingNotifications = await registration.getNotifications({
        tag,
        includeTriggered: true,
      });
      existingNotifications.forEach((notification) => notification.close());
    }

    await registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      requireInteraction: true,
      timestamp,
      icon: DEFAULT_NOTIFICATION_ICON,
      badge: DEFAULT_NOTIFICATION_BADGE,
      data: {
        url: "/",
        ...data,
      },
      showTrigger: new TimestampTrigger(timestamp),
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelTimerNotifications(tags = []) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  const normalizedTags = Array.isArray(tags)
    ? tags.filter(Boolean)
    : [tags].filter(Boolean);

  if (normalizedTags.length === 0) return false;

  const registration = await getTimerServiceWorkerRegistration();
  if (!registration?.getNotifications) return false;

  try {
    const groupedNotifications = await Promise.all(
      normalizedTags.map((tag) => registration.getNotifications({ tag, includeTriggered: true })),
    );

    const notifications = groupedNotifications.flat();
    notifications.forEach((notification) => notification.close());
    return notifications.length > 0;
  } catch {
    return false;
  }
}

export function sendTimerNotification(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return false;
  }

  try {
    const n = new Notification(title, {
      body,
      // Add icon: "/icon.png" once an app icon exists in public/
      tag: "pomopet-timer",
      renotify: true,
    });
    // Auto-close after 8 seconds
    setTimeout(() => n.close(), 8000);
    return true;
  } catch {
    // Notification constructor can throw in some environments (e.g. Android WebView)
    return false;
  }
}
