import { beforeEach, describe, expect, test, vi } from "vitest";

// A minimal chainable Supabase mock. Every query method records its call and
// returns the same thenable object, so any chain (insert / upsert /
// select().eq() / delete().eq().eq()) both threads and resolves.
const { supabaseMock, state } = vi.hoisted(() => {
  const state = { queries: [], getUserCalls: 0 };

  function makeQuery(table) {
    const q = { table, calls: [] };
    for (const m of ["insert", "upsert", "select", "delete", "eq", "order", "single"]) {
      q[m] = (...args) => {
        q.calls.push([m, ...args]);
        return q;
      };
    }
    q.then = (onFulfilled, onRejected) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
    state.queries.push(q);
    return q;
  }

  return {
    state,
    supabaseMock: {
      auth: {
        getUser: () => {
          state.getUserCalls += 1;
          return Promise.resolve({ data: { user: { id: "NETWORK_USER" } } });
        },
      },
      from: (table) => makeQuery(table),
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

import {
  addCaughtPokemon,
  reorderCaughtPokemon,
  saveUserProgress,
  loadInventory,
  saveInventoryItem,
} from "./user-progress";

const findCall = (table, method) =>
  state.queries
    .find((q) => q.table === table)
    ?.calls.find((c) => c[0] === method);

beforeEach(() => {
  state.queries.length = 0;
  state.getUserCalls = 0;
});

describe("user-progress uses the caller-supplied userId (no getUser network call)", () => {
  test("addCaughtPokemon inserts with the provided userId and never calls getUser", async () => {
    await addCaughtPokemon(
      { pokemonId: 25, speciesName: "pikachu", label: "Pikachu" },
      { storageIndex: 3, userId: "user-1" },
    );

    expect(state.getUserCalls).toBe(0);
    const insert = findCall("caught_pokemon", "insert");
    expect(insert[1]).toMatchObject({
      user_id: "user-1",
      pokemon_id: 25,
      species_name: "pikachu",
      storage_index: 3,
    });
  });

  test("addCaughtPokemon is a no-op when no userId is given", async () => {
    await addCaughtPokemon({ pokemonId: 25, speciesName: "pikachu" }, {});
    expect(state.getUserCalls).toBe(0);
    expect(state.queries.length).toBe(0);
  });

  test("reorderCaughtPokemon upserts rows scoped to the provided userId", async () => {
    await reorderCaughtPokemon(
      [{ id: "a", speciesName: "pikachu", storageIndex: 0 }],
      "user-1",
    );

    expect(state.getUserCalls).toBe(0);
    const upsert = findCall("caught_pokemon", "upsert");
    expect(upsert[1][0]).toMatchObject({ user_id: "user-1", species_name: "pikachu", storage_index: 0 });
  });

  test("saveUserProgress upserts progress keyed by the provided userId", async () => {
    await saveUserProgress({
      userId: "user-1",
      totalXp: 120,
      pomodorosCompleted: 4,
      pokedollars: 300,
    });

    expect(state.getUserCalls).toBe(0);
    const upsert = findCall("progress", "upsert");
    expect(upsert[1]).toMatchObject({
      id: "user-1",
      total_xp: 120,
      pomodoros_completed: 4,
      pokedollars: 300,
    });
  });

  test("loadInventory filters by the provided userId", async () => {
    const result = await loadInventory("user-1");

    expect(state.getUserCalls).toBe(0);
    expect(Array.isArray(result)).toBe(true);
    const eq = findCall("inventory", "eq");
    expect(eq).toEqual(["eq", "user_id", "user-1"]);
  });

  test("saveInventoryItem upserts with the provided userId", async () => {
    await saveInventoryItem("fire-stone", 2, "user-1");

    expect(state.getUserCalls).toBe(0);
    const upsert = findCall("inventory", "upsert");
    expect(upsert[1]).toMatchObject({ user_id: "user-1", item_id: "fire-stone", quantity: 2 });
  });

  test("saveInventoryItem is a no-op when no userId is given", async () => {
    await saveInventoryItem("fire-stone", 2);
    expect(state.getUserCalls).toBe(0);
    expect(state.queries.length).toBe(0);
  });
});
