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

async function isWildEncounterable(speciesId, versionSet) {
  // /pokemon/{speciesId}/encounters returns encounters for the default form.
  const encounters = await fetchJson(`${POKEAPI}/pokemon/${speciesId}/encounters`);
  if (!encounters) return false;
  return encounters.some((loc) =>
    loc.version_details.some((vd) => versionSet.has(vd.version.name)),
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
