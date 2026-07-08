import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { supabaseMock, state } = vi.hoisted(() => {
  const state = { getSessionImpl: null };
  return {
    state,
    supabaseMock: {
      auth: {
        getSession: () => state.getSessionImpl(),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        signOut: () => Promise.resolve(),
      },
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

import { AuthProvider, useAuth } from "./auth-context";

beforeEach(() => {
  state.getSessionImpl = null;
});

describe("AuthProvider cold-start resilience", () => {
  test("resolves loading=false with no user when getSession rejects (network failure)", async () => {
    state.getSessionImpl = () => Promise.reject(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBe(null);
  });

  test("still surfaces the session user on a successful getSession", async () => {
    state.getSessionImpl = () =>
      Promise.resolve({ data: { session: { user: { id: "u1" } } } });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toMatchObject({ id: "u1" });
  });
});
