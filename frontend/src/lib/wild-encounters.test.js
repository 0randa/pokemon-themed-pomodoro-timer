import { describe, expect, test } from "vitest";
import { WILD_ENCOUNTERS } from "@/data/wild-encounters";

describe("WILD_ENCOUNTERS static data", () => {
  test("contains exactly the five supported regions", () => {
    expect(Object.keys(WILD_ENCOUNTERS).sort()).toEqual([
      "hoenn",
      "johto",
      "kanto",
      "sinnoh",
      "unova",
    ]);
  });

  test("each region pool is a non-empty array of {speciesName, pokemonId}", () => {
    for (const [regionId, pool] of Object.entries(WILD_ENCOUNTERS)) {
      expect(Array.isArray(pool), `${regionId} should be an array`).toBe(true);
      expect(pool.length, `${regionId} should be non-empty`).toBeGreaterThan(0);
      for (const entry of pool) {
        expect(typeof entry.speciesName).toBe("string");
        expect(entry.speciesName.length).toBeGreaterThan(0);
        expect(Number.isInteger(entry.pokemonId)).toBe(true);
        expect(entry.pokemonId).toBeGreaterThan(0);
      }
    }
  });

  test("Hoenn excludes Gallade (cross-gen evolution split, not in Emerald)", () => {
    expect(
      WILD_ENCOUNTERS.hoenn.some((e) => e.speciesName === "gallade"),
    ).toBe(false);
  });

  test("Hoenn excludes Gardevoir (evolution-only in Emerald)", () => {
    expect(
      WILD_ENCOUNTERS.hoenn.some((e) => e.speciesName === "gardevoir"),
    ).toBe(false);
  });

  test("Hoenn includes Ralts (wild on Route 102)", () => {
    expect(
      WILD_ENCOUNTERS.hoenn.some((e) => e.speciesName === "ralts"),
    ).toBe(true);
  });

  test("Kanto excludes Mew (event-only in FRLG)", () => {
    expect(
      WILD_ENCOUNTERS.kanto.some((e) => e.speciesName === "mew"),
    ).toBe(false);
  });

  test("Kanto includes Mewtwo (wild in Cerulean Cave in FRLG)", () => {
    expect(
      WILD_ENCOUNTERS.kanto.some((e) => e.speciesName === "mewtwo"),
    ).toBe(true);
  });

  test("starters are gift-only and must not appear in their region's wild pool", () => {
    const cases = [
      ["kanto",  "bulbasaur"],
      ["kanto",  "charmander"],
      ["kanto",  "squirtle"],
      ["johto",  "chikorita"],
      ["johto",  "cyndaquil"],
      ["johto",  "totodile"],
      ["hoenn",  "treecko"],
      ["hoenn",  "torchic"],
      ["hoenn",  "mudkip"],
      ["sinnoh", "turtwig"],
      ["sinnoh", "chimchar"],
      ["sinnoh", "piplup"],
      ["unova",  "snivy"],
      ["unova",  "tepig"],
      ["unova",  "oshawott"],
    ];
    for (const [regionId, starter] of cases) {
      expect(
        WILD_ENCOUNTERS[regionId].some((e) => e.speciesName === starter),
        `${starter} must not appear in ${regionId} wild pool`,
      ).toBe(false);
    }
  });
});
