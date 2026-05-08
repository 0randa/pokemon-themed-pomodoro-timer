# Region-Restricted Wild Encounters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict wild Pokemon encounters during pomodoro sessions to species that are wild-catchable in each region's canonical game (Kanto = FireRed/LeafGreen, Johto = HeartGold/SoulSilver, Hoenn = Emerald, Sinnoh = Platinum, Unova = Black 2/White 2). Pokemon are still keyed by national-Pokédex IDs. Fixes the bug where Gallade (an evolution-only species in ORAS, not present in Emerald) appeared as a Hoenn wild encounter.

**Architecture:** A one-shot Node script crawls PokeAPI to compute, for each region, the species that have *any* wild encounter in that region's canonical game version. The result is committed as five JSON files. `useWildPool` becomes a synchronous lookup against the static data, removing the existing PokeAPI runtime fetch / caching / fallback logic.

**Tech Stack:** Node 18+ (native `fetch`) for the script; Vitest for tests; React 19 / Next 16 for the app.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `frontend/scripts/generate-wild-encounters.mjs` | One-shot PokeAPI crawler that emits per-region wild-encounter JSON |
| Create | `frontend/src/data/wild-encounters/kanto.json` | FRLG wild-encounterable species (national-id keyed) |
| Create | `frontend/src/data/wild-encounters/johto.json` | HGSS wild-encounterable species |
| Create | `frontend/src/data/wild-encounters/hoenn.json` | Emerald wild-encounterable species |
| Create | `frontend/src/data/wild-encounters/sinnoh.json` | Platinum wild-encounterable species |
| Create | `frontend/src/data/wild-encounters/unova.json` | B2W2 wild-encounterable species |
| Create | `frontend/src/data/wild-encounters/index.js` | Re-exports the five datasets as `WILD_ENCOUNTERS` |
| Create | `frontend/src/lib/wild-encounters.test.js` | Invariant tests on the static data (e.g., Gallade ∉ Hoenn) |
| Create | `frontend/src/hooks/use-wild-pool.test.js` | Unit tests for the simplified hook |
| Modify | `frontend/src/hooks/use-wild-pool.js` | Drop async PokeAPI fetch + cache; return static data synchronously |
| Modify | `frontend/src/lib/regions.js` | Drop `pokedexName` field and `WILD_FALLBACKS` export |

---

## Task 1: Build the wild-encounter generation script

**Files:**
- Create: `frontend/scripts/generate-wild-encounters.mjs`

- [ ] **Step 1: Create the script**

Create `frontend/scripts/generate-wild-encounters.mjs` with the following content:

```js
#!/usr/bin/env node
// One-shot generator. Crawls PokeAPI and writes
//   frontend/src/data/wild-encounters/<region>.json
// — one entry per species in the regional Pokedex that has any wild encounter
// in the canonical game version(s) for that region.
//
// Run from anywhere:
//   node frontend/scripts/generate-wild-encounters.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = resolve(dirname(__filename), "..");
const OUT_DIR = resolve(FRONTEND_ROOT, "src/data/wild-encounters");

const POKEAPI = "https://pokeapi.co/api/v2";

// regionId          : the in-app region key
// pokedex           : PokeAPI Pokedex slug used to seed the species list
// versions          : PokeAPI version slug(s) treated as "canonical" for the region
const REGIONS = [
  { regionId: "kanto",  pokedex: "kanto",           versions: ["firered", "leafgreen"] },
  { regionId: "johto",  pokedex: "updated-johto",   versions: ["heartgold", "soulsilver"] },
  { regionId: "hoenn",  pokedex: "hoenn",           versions: ["emerald"] },
  { regionId: "sinnoh", pokedex: "extended-sinnoh", versions: ["platinum"] },
  { regionId: "unova",  pokedex: "updated-unova",   versions: ["black-2", "white-2"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      // 429 / 5xx: exponential backoff
      await sleep(500 * 2 ** i);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(500 * 2 ** i);
    }
  }
  throw new Error(`fetch ${url} failed after ${attempts} attempts`);
}

function idFromUrl(url) {
  const m = /\/(\d+)\/?$/.exec(url);
  return m ? Number(m[1]) : null;
}

async function speciesEntries(pokedexSlug) {
  const dex = await fetchJson(`${POKEAPI}/pokedex/${pokedexSlug}/`);
  if (!dex) throw new Error(`unknown pokedex: ${pokedexSlug}`);
  return dex.pokemon_entries
    .map((entry) => ({
      speciesName: entry.pokemon_species.name,
      speciesId: idFromUrl(entry.pokemon_species.url),
    }))
    .filter((e) => e.speciesId !== null);
}

// "Wild" encounter methods only — excludes gift, gift-egg, trade, fossil-revive,
// pokemon-transfer, etc., which PokeAPI also reports under /encounters.
const WILD_METHODS = new Set([
  "walk", "surf", "old-rod", "good-rod", "super-rod",
  "rock-smash", "headbutt", "dark-grass", "grass-spots",
  "cave-spots", "bridge-spots", "super-rod-spots", "surf-spots",
  "yellow-flowers", "purple-flowers", "red-flowers",
  "rough-terrain", "seaweed", "tall-grass", "long-grass",
  "shaking-grass", "dust-cloud", "rippling-water",
  "fishing-spots", "swarm", "horde-encounter",
  "only-grass-in-shoal-cave", "gift-pokeradar",
  "feebas-tile-fishing",
  "only-one", // static legendaries (e.g., Mewtwo in Cerulean Cave, Rayquaza atop Sky Pillar)
]);

async function isWildEncounterable(speciesId, versionSet) {
  // /pokemon/{speciesId}/encounters returns encounters for the default form.
  const encounters = await fetchJson(`${POKEAPI}/pokemon/${speciesId}/encounters`);
  if (!encounters) return false;
  return encounters.some((loc) =>
    loc.version_details.some(
      (vd) =>
        versionSet.has(vd.version.name) &&
        vd.encounter_details.some((ed) => WILD_METHODS.has(ed.method.name)),
    ),
  );
}

async function buildRegion({ regionId, pokedex, versions }) {
  const species = await speciesEntries(pokedex);
  const versionSet = new Set(versions);
  const result = [];
  let i = 0;
  for (const { speciesName, speciesId } of species) {
    i++;
    const wild = await isWildEncounterable(speciesId, versionSet);
    if (wild) {
      result.push({ speciesName, pokemonId: speciesId });
    }
    if (i % 25 === 0) {
      process.stdout.write(`  ${regionId}: scanned ${i}/${species.length}\n`);
    }
    await sleep(40); // be polite to PokeAPI
  }
  result.sort((a, b) => a.pokemonId - b.pokemonId);
  return result;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const region of REGIONS) {
    console.log(
      `\n[${region.regionId}] pokedex=${region.pokedex} versions=${region.versions.join(",")}`,
    );
    const data = await buildRegion(region);
    const outPath = resolve(OUT_DIR, `${region.regionId}.json`);
    await writeFile(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`  -> ${data.length} entries -> ${outPath}`);
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the script parses (no execution yet)**

```bash
node --check frontend/scripts/generate-wild-encounters.mjs
```

Expected: exits 0 with no output (syntax OK).

- [ ] **Step 3: Commit the script**

```bash
git add frontend/scripts/generate-wild-encounters.mjs
git commit -m "feat: add one-shot wild-encounter dataset generator"
```

---

## Task 2: Run the script and commit the data

**Files:**
- Create: `frontend/src/data/wild-encounters/kanto.json`
- Create: `frontend/src/data/wild-encounters/johto.json`
- Create: `frontend/src/data/wild-encounters/hoenn.json`
- Create: `frontend/src/data/wild-encounters/sinnoh.json`
- Create: `frontend/src/data/wild-encounters/unova.json`

- [ ] **Step 1: Run the generator**

```bash
node frontend/scripts/generate-wild-encounters.mjs
```

Expected: ~3–6 minutes total (5 regions × ~150–300 species × 40 ms throttle + network round-trips). Logs each region's scan progress, then prints `-> N entries -> <path>` per region. On success, five JSON files exist under `frontend/src/data/wild-encounters/`.

If the script errors on a transient network issue, re-run — `fetchJson` retries with exponential backoff but a hard failure can still surface.

- [ ] **Step 2: Verify the bug-fix invariants in the generated data**

The whole point of this change is that Gallade should no longer appear in Hoenn. Verify with:

```bash
node -e "const d=require('./frontend/src/data/wild-encounters/hoenn.json'); console.log('Hoenn entries:',d.length); console.log('gallade:',d.some(e=>e.speciesName==='gallade')); console.log('gardevoir:',d.some(e=>e.speciesName==='gardevoir')); console.log('ralts:',d.some(e=>e.speciesName==='ralts')); console.log('rayquaza:',d.some(e=>e.speciesName==='rayquaza'));"
```

Expected:
```
Hoenn entries: 130-150        (approximate)
gallade: false                (Gallade is Gen-4; not in Emerald)
gardevoir: false              (Evolution-only in Emerald)
ralts: true                   (Wild on Route 102)
rayquaza: true                (Static wild on Sky Pillar in Emerald)
```

```bash
node -e "const d=require('./frontend/src/data/wild-encounters/kanto.json'); console.log('Kanto entries:',d.length); console.log('pidgey:',d.some(e=>e.speciesName==='pidgey')); console.log('mew:',d.some(e=>e.speciesName==='mew')); console.log('mewtwo:',d.some(e=>e.speciesName==='mewtwo'));"
```

Expected:
```
Kanto entries: 100-140        (approximate)
pidgey: true                  (Wild on Routes 1-18)
mew: false                    (Event-only)
mewtwo: true                  (Wild in Cerulean Cave in FRLG)
```

```bash
node -e "const d=require('./frontend/src/data/wild-encounters/sinnoh.json'); console.log('Sinnoh entries:',d.length); console.log('starly:',d.some(e=>e.speciesName==='starly')); console.log('rotom:',d.some(e=>e.speciesName==='rotom'));"
```

Expected:
```
Sinnoh entries: 100-180       (approximate)
starly: true                  (Wild on Route 201)
rotom: true                   (Wild in Old Chateau in Platinum)
```

Starters are gift-only and must NOT be in any wild pool. Verify:

```bash
node -e "
const r = (n)=>require('./frontend/src/data/wild-encounters/'+n+'.json');
const has = (n,s)=>r(n).some(e=>e.speciesName===s);
console.log('bulbasaur in kanto:', has('kanto','bulbasaur'));
console.log('chikorita in johto:', has('johto','chikorita'));
console.log('treecko in hoenn:',  has('hoenn','treecko'));
console.log('mudkip in hoenn:',   has('hoenn','mudkip'));
console.log('turtwig in sinnoh:', has('sinnoh','turtwig'));
console.log('snivy in unova:',    has('unova','snivy'));
"
```

Expected: every line prints `false`.

If any invariant is wrong (especially `gallade: true` in Hoenn or any starter `true` in its region), STOP. The version mapping or method filter in the generator is wrong; fix it, regenerate, re-verify before continuing.

- [ ] **Step 3: Commit the data**

```bash
git add frontend/src/data/wild-encounters/
git commit -m "feat: add wild-encounter datasets per region (FRLG/HGSS/Emerald/Platinum/B2W2)"
```

---

## Task 3: Add a static-data index module with invariant tests

**Files:**
- Create: `frontend/src/data/wild-encounters/index.js`
- Create: `frontend/src/lib/wild-encounters.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/wild-encounters.test.js`:

```js
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
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd frontend && npx vitest run src/lib/wild-encounters.test.js
```

Expected: FAIL with module-resolution error — `@/data/wild-encounters` does not yet export anything.

- [ ] **Step 3: Create the index module**

Create `frontend/src/data/wild-encounters/index.js`:

```js
import kanto from "./kanto.json";
import johto from "./johto.json";
import hoenn from "./hoenn.json";
import sinnoh from "./sinnoh.json";
import unova from "./unova.json";

export const WILD_ENCOUNTERS = {
  kanto,
  johto,
  hoenn,
  sinnoh,
  unova,
};
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd frontend && npx vitest run src/lib/wild-encounters.test.js
```

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data/wild-encounters/index.js frontend/src/lib/wild-encounters.test.js
git commit -m "feat: WILD_ENCOUNTERS index + invariant tests"
```

---

## Task 4: Switch useWildPool to read static data synchronously

**Files:**
- Modify: `frontend/src/hooks/use-wild-pool.js`
- Create: `frontend/src/hooks/use-wild-pool.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/use-wild-pool.test.js`:

```js
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
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd frontend && npx vitest run src/hooks/use-wild-pool.test.js
```

Expected: FAIL — the existing hook returns `null` synchronously and only resolves to the pool after an async PokeAPI fetch, so the synchronous expectations fail.

- [ ] **Step 3: Replace the hook implementation**

Replace the entire contents of `frontend/src/hooks/use-wild-pool.js` with:

```js
import { WILD_ENCOUNTERS } from "@/data/wild-encounters";

export function useWildPool(regionId) {
  const wildPool = regionId ? (WILD_ENCOUNTERS[regionId] ?? null) : null;
  return { wildPool, loading: false };
}
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd frontend && npx vitest run src/hooks/use-wild-pool.test.js
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run the full unit test suite**

```bash
cd frontend && npm test
```

Expected: all tests pass. In particular:
- `use-wild-encounter.integration.test.jsx` continues to pass (it constructs its own `KANTO_FALLBACK` array and never imports `useWildPool`).
- The new `wild-encounters.test.js` and `use-wild-pool.test.js` are green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/use-wild-pool.js frontend/src/hooks/use-wild-pool.test.js
git commit -m "refactor: useWildPool reads static data, removing PokeAPI runtime fetch"
```

---

## Task 5: Remove the now-unused `pokedexName` field and `WILD_FALLBACKS`

**Files:**
- Modify: `frontend/src/lib/regions.js`

- [ ] **Step 1: Confirm there are no remaining consumers**

Search the repo:

```bash
cd /mnt/d/Programming/productivity-app
```

Use Grep (or `npx eslint . --rule no-unused-vars`):
- Search `pokedexName` — must only match `frontend/src/lib/regions.js`.
- Search `WILD_FALLBACKS` — must only match `frontend/src/lib/regions.js`.

If any other file references either symbol, STOP and update that consumer first.

- [ ] **Step 2: Remove `pokedexName` from each region object**

Open `frontend/src/lib/regions.js`. Delete the `pokedexName: "..."` line from each of the 5 region objects. For example, change:

```js
{
  regionId: "hoenn",
  label: "Hoenn",
  pokedexName: "updated-hoenn",
  starters: [
    makeStarter("hoenn", "treecko", 252, "Treecko"),
    makeStarter("hoenn", "torchic", 255, "Torchic"),
    makeStarter("hoenn", "mudkip",  258, "Mudkip"),
  ],
},
```

to:

```js
{
  regionId: "hoenn",
  label: "Hoenn",
  starters: [
    makeStarter("hoenn", "treecko", 252, "Treecko"),
    makeStarter("hoenn", "torchic", 255, "Torchic"),
    makeStarter("hoenn", "mudkip",  258, "Mudkip"),
  ],
},
```

Repeat for `kanto`, `johto`, `sinnoh`, `unova`.

- [ ] **Step 3: Remove the `WILD_FALLBACKS` export**

In the same file, delete the entire `// Small fallback pools used when the PokeAPI pokedex fetch fails.` comment and the `export const WILD_FALLBACKS = { ... };` block beneath it (lines 83–145 in the current file).

- [ ] **Step 4: Run the full test suite**

```bash
cd frontend && npm test
```

Expected: PASS.

- [ ] **Step 5: Run lint and a production build**

```bash
cd frontend && npm run lint && npm run build
```

Expected: lint clean; `next build` finishes successfully. Any unresolved import of `WILD_FALLBACKS` or `pokedexName` would surface here.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/regions.js
git commit -m "chore: remove obsolete pokedexName + WILD_FALLBACKS from regions"
```

---

## Task 6: Manual smoke test in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

Wait for "Ready on http://localhost:3000" (or whatever port Next reports).

- [ ] **Step 2: Reproduce the original bug scenario (Hoenn → Mudkip)**

In the browser:
1. Sign in (guest or normal account).
2. Pick the **Hoenn** region, then **Mudkip**.
3. Enable testing mode in the UI (so encounter chance is 100%).
4. Run a pomodoro to completion.
5. Trigger ~10 encounters back-to-back (skip after each, run another pomodoro or use whatever flow forces a new encounter).

Expected:
- Every wild Pokemon shown is present in `frontend/src/data/wild-encounters/hoenn.json`.
- **Gallade never appears.**
- Sprites render in Emerald style; cries play.

- [ ] **Step 3: Spot-check one other region**

Repeat with **Kanto → Charmander**. Trigger several encounters. Expected: every Pokemon is from `kanto.json` (e.g. Pidgey, Rattata, Geodude). No Sinnoh-only mons (e.g. Bidoof) appear.

- [ ] **Step 4: Stop the dev server**

`Ctrl+C` in the terminal running `npm run dev`.

- [ ] **Step 5: Final verification before declaring done**

```bash
cd frontend && npm test && npm run lint && npm run build
```

Expected: all three commands succeed. If anything fails, do not claim the task is complete — fix and re-verify.

---
