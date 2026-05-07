import { describe, expect, test } from "vitest";
import { didDeadlineExpireWhileBackgrounded, isPageBackgrounded } from "@/lib/page-attention";

describe("page attention helpers", () => {
  test("treats a hidden document as backgrounded", () => {
    const doc = {
      visibilityState: "hidden",
      hasFocus: () => true,
    };

    expect(isPageBackgrounded(doc)).toBe(true);
  });

  test("treats an unfocused visible document as backgrounded", () => {
    const doc = {
      visibilityState: "visible",
      hasFocus: () => false,
    };

    expect(isPageBackgrounded(doc)).toBe(true);
  });

  test("treats a visible focused document as active", () => {
    const doc = {
      visibilityState: "visible",
      hasFocus: () => true,
    };

    expect(isPageBackgrounded(doc)).toBe(false);
  });

  test("detects when a deadline expires during a background stint", () => {
    expect(
      didDeadlineExpireWhileBackgrounded({
        deadlineMs: 2_000,
        backgroundedAtMs: 1_500,
        nowMs: 2_500,
      }),
    ).toBe(true);
  });

  test("ignores background stints that ended before the deadline", () => {
    expect(
      didDeadlineExpireWhileBackgrounded({
        deadlineMs: 2_000,
        backgroundedAtMs: 1_500,
        nowMs: 1_900,
      }),
    ).toBe(false);
  });

  test("ignores missing timing data", () => {
    expect(
      didDeadlineExpireWhileBackgrounded({
        deadlineMs: null,
        backgroundedAtMs: 1_500,
        nowMs: 2_500,
      }),
    ).toBe(false);
  });
});
