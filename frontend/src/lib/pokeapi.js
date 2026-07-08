/**
 * PokeAPI access with retry + in-memory caching.
 *
 * The public PokeAPI is external and rate-limited; on a cold start a request
 * can transiently fail with `TypeError: Failed to fetch`. `fetchWithRetry`
 * recovers from those blips with exponential backoff, and `loadGrowthData`
 * caches the parsed result per species so remounts/evolutions don't re-hit
 * the network.
 */

import {
  formatPokemonName,
  getNextEvolutionEntry,
  getPokemonIdFromResourceUrl,
} from "./pokemon";
import { getRequiredItem } from "./shop";

const POKEAPI = "https://pokeapi.co/api/v2";

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (ms <= 0) return resolve();
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/**
 * Fetch a URL, retrying transient failures (network errors and non-ok HTTP
 * statuses) with exponential backoff. Aborts are never retried and propagate
 * immediately.
 */
export async function fetchWithRetry(
  url,
  { signal, retries = 3, baseDelay = 300 } = {},
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res;
    } catch (error) {
      // Don't retry a caller-initiated abort — let it surface at once.
      if (error?.name === "AbortError" || signal?.aborted) throw error;
      lastError = error;
      if (attempt === retries) break;
      await sleep(baseDelay * 2 ** attempt, signal);
    }
  }
  throw lastError;
}

// species pokemonId -> { levels, nextEvolution }
const growthCache = new Map();

/**
 * Load and parse a species' growth-rate table and next-evolution entry from
 * PokeAPI, with retry and caching. Throws only on a permanent failure (after
 * retries) or on an abort.
 *
 * @param {number} pokemonId
 * @param {{ signal?: AbortSignal, retries?: number, baseDelay?: number }} [options]
 * @returns {Promise<{ levels: Array<{level:number,experience:number}>, nextEvolution: object|null }>}
 */
export async function loadGrowthData(pokemonId, options = {}) {
  if (growthCache.has(pokemonId)) return growthCache.get(pokemonId);

  const speciesRes = await fetchWithRetry(
    `${POKEAPI}/pokemon-species/${pokemonId}`,
    options,
  );
  const species = await speciesRes.json();

  const growthRateUrl = species.growth_rate?.url;
  if (!growthRateUrl) throw new Error("Growth rate URL is missing from species response.");
  const evolutionChainUrl = species.evolution_chain?.url;
  if (!evolutionChainUrl) throw new Error("Evolution chain URL is missing from species response.");

  const [growthRes, evolutionRes] = await Promise.all([
    fetchWithRetry(growthRateUrl, options),
    fetchWithRetry(evolutionChainUrl, options),
  ]);
  const [growthData, evolutionData] = await Promise.all([
    growthRes.json(),
    evolutionRes.json(),
  ]);

  const levels = (growthData.levels ?? [])
    .map((entry) => ({ level: entry.level, experience: entry.experience }))
    .sort((a, b) => a.level - b.level);
  if (!levels.length) throw new Error("Growth rate table is empty.");

  const nextEvolution = parseNextEvolution(evolutionData.chain, species.name);

  const result = { levels, nextEvolution };
  growthCache.set(pokemonId, result);
  return result;
}

function parseNextEvolution(chain, speciesName) {
  const entry = getNextEvolutionEntry(chain, speciesName);
  if (!entry) return null;

  const pokemonId = getPokemonIdFromResourceUrl(entry.candidate.species?.url);
  if (!pokemonId) return null;

  return {
    pokemonId,
    speciesName: entry.candidate.species.name,
    label: formatPokemonName(entry.candidate.species.name),
    minLevel: entry.minLevel,
    trigger: entry.trigger,
    item: entry.item,
    minHappiness: entry.minHappiness,
    requiredShopItem: getRequiredItem(entry.evolutionDetails ?? []),
  };
}
