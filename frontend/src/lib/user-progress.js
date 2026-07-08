import { supabase } from "./supabase";
import { getPokemonAssets } from "./pokemon";

export const MAX_PARTY_SIZE = 6;
export const MAX_BOX_SIZE = 30;

export async function loadUserProgress() {
  const [{ data: profile }, { data: progress }] = await Promise.all([
    supabase.from("profiles").select("*").single(),
    supabase.from("progress").select("*").single(),
  ]);

  const regionId = profile?.game_region ?? null;

  const activePokemon = profile
    ? {
        key: profile.starter_key,
        speciesName: profile.starter_key,
        pokemonId: profile.starter_pokemon_id,
        label: profile.starter_label,
        ...getPokemonAssets(profile.starter_pokemon_id, regionId),
      }
    : null;

  // Prefer persisted order; fall back to caught_at for older rows/projects.
  const { data: caughtRows } = await supabase
    .from("caught_pokemon")
    .select("*")
    .order("storage_index", { ascending: true, nullsFirst: false })
    .order("caught_at", { ascending: true });

  const caughtPokemon = (caughtRows ?? []).map((row) => ({
    id: row.id,
    key: row.species_name,
    speciesName: row.species_name,
    pokemonId: row.pokemon_id,
    label: row.label,
    storageIndex: row.storage_index ?? null,
    ...getPokemonAssets(row.pokemon_id, regionId),
  }));

  // Ensure the starter (activePokemon) appears in the party list for UI/account display,
  // even if it hasn't been inserted into `caught_pokemon` yet.
  const caughtWithStarter = activePokemon
    ? caughtPokemon.some((p) => p?.speciesName === activePokemon.speciesName)
      ? caughtPokemon
      : [
          {
            ...activePokemon,
            // Synthetic entry (starter not yet in caught_pokemon).
            // Use -1 so normalizeStorageOrder always places the starter first.
            id: null,
            storageIndex: -1,
          },
          ...caughtPokemon,
        ]
    : caughtPokemon;

  // If we have any null storageIndex values, normalize locally to a dense order
  // (and let the Box UI persist it when the user reorders).
  const normalizedCaught = normalizeStorageOrder(caughtWithStarter);

  return {
    activePokemon,
    totalXp: progress?.total_xp ?? 0,
    pomodorosCompleted: progress?.pomodoros_completed ?? 0,
    pokedollars: progress?.pokedollars ?? 0,
    caughtPokemon: normalizedCaught,
    regionId,
    // Checkin/streak fields
    streak: progress?.streak ?? 0,
    lastStreakDate: progress?.last_streak_date ?? null,
    shieldsAvailable: progress?.shields_available ?? 0,
    lastCheckinDate: progress?.last_checkin_date ?? null,
    longestStreak: progress?.longest_streak ?? 0,
  };
}

export async function addCaughtPokemon(pokemon, { storageIndex, userId } = {}) {
  // userId comes from the auth context — avoids a network-bound getUser() call
  // that also contends for the Supabase auth lock on cold start.
  if (!userId) return;

  await supabase.from("caught_pokemon").insert({
    user_id: userId,
    pokemon_id: pokemon.pokemonId,
    species_name: pokemon.speciesName,
    label: pokemon.label,
    ...(typeof storageIndex === "number" ? { storage_index: storageIndex } : {}),
  });
}

export async function reorderCaughtPokemon(order, userId) {
  // order: [{ id, speciesName, storageIndex }]
  if (!userId) return;
  const rows = (order ?? [])
    .filter((entry) => entry && typeof entry.storageIndex === "number")
    .map((entry) => ({
      user_id: userId,
      ...(entry.id ? { id: entry.id } : {}),
      species_name: entry.speciesName,
      storage_index: entry.storageIndex,
    }));
  if (!rows.length) return;

  // We rely on an existing unique constraint on (user_id, species_name) or primary key id.
  // If id is present, Supabase will upsert by primary key; otherwise by conflict target (if configured).
  // If your table doesn't support upsert by species_name, prefer the id path.
  await supabase.from("caught_pokemon").upsert(rows, { onConflict: "id" });
}

export async function saveUserProgress({
  userId,
  activePokemon,
  totalXp,
  pomodorosCompleted,
  pokedollars,
  regionId,
  streak,
  lastStreakDate,
  shieldsAvailable,
  lastCheckinDate,
  longestStreak,
}) {
  if (!userId) return;

  const promises = [];

  if (activePokemon) {
    promises.push(
      supabase.from("profiles").upsert({
        id: userId,
        starter_key: activePokemon.key,
        starter_pokemon_id: activePokemon.pokemonId,
        starter_label: activePokemon.label,
        starter_sprite: activePokemon.sprite,
        ...(regionId ? { game_region: regionId } : {}),
      })
    );
  }

  const progressRow = {
    id: userId,
    total_xp: totalXp,
    pomodoros_completed: pomodorosCompleted,
    pokedollars: pokedollars ?? 0,
    updated_at: new Date().toISOString(),
  };

  // Only include checkin/streak fields when explicitly provided
  if (typeof streak === 'number')           progressRow.streak = streak;
  // null is a valid write — allows callers to clear the date in Supabase
  if (lastStreakDate !== undefined)          progressRow.last_streak_date = lastStreakDate;
  if (typeof shieldsAvailable === 'number') progressRow.shields_available = shieldsAvailable;
  if (lastCheckinDate !== undefined)         progressRow.last_checkin_date = lastCheckinDate;
  if (typeof longestStreak === 'number')    progressRow.longest_streak = longestStreak;

  promises.push(supabase.from("progress").upsert(progressRow));
  await Promise.all(promises);
}

// ── Inventory (shop items) ──────────────────────────────────────────────────

export async function loadInventory(userId) {
  if (!userId) return [];

  const { data } = await supabase
    .from("inventory")
    .select("item_id, quantity")
    .eq("user_id", userId);

  return (data ?? []).map((row) => ({ itemId: row.item_id, quantity: row.quantity }));
}

export async function saveInventoryItem(itemId, quantity, userId) {
  if (!userId) return;

  if (quantity <= 0) {
    await supabase.from("inventory").delete().eq("user_id", userId).eq("item_id", itemId);
  } else {
    await supabase.from("inventory").upsert(
      { user_id: userId, item_id: itemId, quantity },
      { onConflict: "user_id,item_id" },
    );
  }
}

export function normalizeStorageOrder(caughtPokemon) {
  const list = Array.isArray(caughtPokemon) ? [...caughtPokemon] : [];

  // Sort by storageIndex when available; keep relative order for nulls.
  list.sort((a, b) => {
    const ai = typeof a?.storageIndex === "number" ? a.storageIndex : null;
    const bi = typeof b?.storageIndex === "number" ? b.storageIndex : null;
    if (ai === null && bi === null) return 0;
    if (ai === null) return 1;
    if (bi === null) return -1;
    return ai - bi;
  });

  // Reindex densely (0..n-1) for UI usage.
  return list.map((p, index) => ({ ...p, storageIndex: index }));
}
