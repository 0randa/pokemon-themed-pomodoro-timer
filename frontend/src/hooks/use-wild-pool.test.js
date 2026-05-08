import { describe, expect, test } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWildPool } from "@/hooks/use-wild-pool";
import { WILD_ENCOUNTERS } from "@/data/wild-encounters";

describe("useWildPool (static data lookup)", () => {
  test("returns null pool when regionId is missing", () => {
    const { result } = renderHook(() => useWildPool(null));
    expect(result.current.wildPool).toBe(null);
    expect(result.current.loading).toBe(false);
  });

  test("returns the Hoenn pool synchronously on first render", () => {
    const { result } = renderHook(() => useWildPool("hoenn"));
    expect(result.current.wildPool).toEqual(WILD_ENCOUNTERS.hoenn);
    expect(result.current.loading).toBe(false);
  });

  test("returns the Kanto pool synchronously on first render", () => {
    const { result } = renderHook(() => useWildPool("kanto"));
    expect(result.current.wildPool).toEqual(WILD_ENCOUNTERS.kanto);
    expect(result.current.loading).toBe(false);
  });

  test("returns null for an unknown region", () => {
    const { result } = renderHook(() => useWildPool("kalos"));
    expect(result.current.wildPool).toBe(null);
    expect(result.current.loading).toBe(false);
  });

  test("Hoenn pool returned by hook excludes Gallade", () => {
    const { result } = renderHook(() => useWildPool("hoenn"));
    const names = result.current.wildPool.map((e) => e.speciesName);
    expect(names).not.toContain("gallade");
  });
});
