import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchWithRetry, loadGrowthData } from "./pokeapi";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWithRetry", () => {
  test("retries transient network failures, then resolves", async () => {
    let calls = 0;
    global.fetch = vi.fn(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve({ ok: true, status: 200 });
    });

    const res = await fetchWithRetry("https://pokeapi.co/x", { baseDelay: 0 });

    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });

  test("throws after exhausting all retries", async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(
      fetchWithRetry("https://pokeapi.co/x", { retries: 2, baseDelay: 0 }),
    ).rejects.toThrow("Failed to fetch");
    // 1 initial attempt + 2 retries
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("does not retry when the request is aborted", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    global.fetch = vi.fn(() => Promise.reject(abortError));

    await expect(
      fetchWithRetry("https://pokeapi.co/x", { retries: 3, baseDelay: 0 }),
    ).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("retries on a non-ok HTTP status", async () => {
    let calls = 0;
    global.fetch = vi.fn(() => {
      calls += 1;
      if (calls < 2) return Promise.resolve({ ok: false, status: 503 });
      return Promise.resolve({ ok: true, status: 200 });
    });

    const res = await fetchWithRetry("https://pokeapi.co/x", { baseDelay: 0 });

    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });
});

describe("loadGrowthData", () => {
  function mockPokeApi() {
    global.fetch = vi.fn((url) => {
      if (url.includes("/pokemon-species/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: "bulbasaur",
              growth_rate: { url: "https://pokeapi.co/api/v2/growth-rate/4/" },
              evolution_chain: { url: "https://pokeapi.co/api/v2/evolution-chain/1/" },
            }),
        });
      }
      if (url.includes("/growth-rate/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              levels: [
                { level: 5, experience: 100 },
                { level: 1, experience: 0 },
                { level: 16, experience: 1000 },
              ],
            }),
        });
      }
      if (url.includes("/evolution-chain/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              chain: {
                species: {
                  name: "bulbasaur",
                  url: "https://pokeapi.co/api/v2/pokemon-species/1/",
                },
                evolves_to: [
                  {
                    species: {
                      name: "ivysaur",
                      url: "https://pokeapi.co/api/v2/pokemon-species/2/",
                    },
                    evolution_details: [
                      { min_level: 16, trigger: { name: "level-up" } },
                    ],
                    evolves_to: [],
                  },
                ],
              },
            }),
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  }

  test("returns levels sorted by level and the next evolution", async () => {
    mockPokeApi();

    const { levels, nextEvolution } = await loadGrowthData(1);

    expect(levels).toEqual([
      { level: 1, experience: 0 },
      { level: 5, experience: 100 },
      { level: 16, experience: 1000 },
    ]);
    expect(nextEvolution).toMatchObject({
      pokemonId: 2,
      speciesName: "ivysaur",
      label: "Ivysaur",
      minLevel: 16,
    });
  });

  test("caches by pokemonId — a second call does not refetch", async () => {
    mockPokeApi();

    // Use an id not used by any other test so the module cache is clean for it.
    await loadGrowthData(424242);
    await loadGrowthData(424242);

    // species + growth-rate + evolution-chain === 3 fetches for the first call only
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
