export function isPageBackgrounded(doc = typeof document === "undefined" ? null : document) {
  if (!doc) return false;

  const hidden = doc.visibilityState === "hidden";
  const hasFocus = typeof doc.hasFocus === "function" ? doc.hasFocus() : true;

  return hidden || !hasFocus;
}

export function didDeadlineExpireWhileBackgrounded({
  deadlineMs,
  backgroundedAtMs,
  nowMs = Date.now(),
}) {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(backgroundedAtMs)) {
    return false;
  }

  return backgroundedAtMs <= deadlineMs && nowMs >= deadlineMs;
}
