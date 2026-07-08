import { useEffect, useMemo, useState } from "react";
import {
  FALLBACK_XP_PER_LEVEL,
  MAX_LEVEL,
  START_LEVEL,
  calculateLevelFromExperience,
  getExperienceForLevel,
} from "@/lib/pokemon";
import { loadGrowthData } from "@/lib/pokeapi";

export function usePokemonProgress({ activePokemon, totalXp }) {
  const [growthLevels, setGrowthLevels] = useState([]);
  const [isGrowthDataLoading, setIsGrowthDataLoading] = useState(false);
  const [growthDataError, setGrowthDataError] = useState("");
  const [nextEvolution, setNextEvolution] = useState(null);

  useEffect(() => {
    if (!activePokemon) {
      setGrowthLevels([]);
      setGrowthDataError("");
      setIsGrowthDataLoading(false);
      setNextEvolution(null);
      return;
    }

    let isActive = true;
    const abortController = new AbortController();

    const load = async () => {
      setIsGrowthDataLoading(true);
      setGrowthDataError("");
      setNextEvolution(null);

      try {
        const { levels, nextEvolution: evolution } = await loadGrowthData(
          activePokemon.pokemonId,
          { signal: abortController.signal },
        );

        if (!isActive) return;

        setGrowthLevels(levels);
        setNextEvolution(evolution);
      } catch (error) {
        if (!isActive || error?.name === "AbortError") {
          return;
        }

        // Transient blips are already retried inside loadGrowthData; reaching
        // here means a persistent failure. Warn (not error) so it doesn't trip
        // the dev error overlay, and fall back to the local leveling curve.
        console.warn("Could not load growth data from PokeAPI:", error);
        setGrowthLevels([]);
        setNextEvolution(null);
        setGrowthDataError("Could not load PokeAPI growth data. Using fallback leveling.");
      } finally {
        if (isActive) {
          setIsGrowthDataLoading(false);
        }
      }
    };

    load();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [activePokemon]);

  const baseExperienceAtStartLevel = useMemo(() => {
    if (!growthLevels.length) {
      return START_LEVEL * FALLBACK_XP_PER_LEVEL;
    }
    return getExperienceForLevel(growthLevels, START_LEVEL);
  }, [growthLevels]);

  const totalExperience = baseExperienceAtStartLevel + totalXp;

  const level = useMemo(() => {
    if (!growthLevels.length) {
      return Math.min(
        MAX_LEVEL,
        START_LEVEL + Math.floor(totalXp / FALLBACK_XP_PER_LEVEL),
      );
    }

    return calculateLevelFromExperience(
      growthLevels,
      baseExperienceAtStartLevel + totalXp,
    );
  }, [baseExperienceAtStartLevel, growthLevels, totalXp]);

  const getLevelForEarnedXp = (earnedXp) => {
    if (!growthLevels.length) {
      return Math.min(
        MAX_LEVEL,
        START_LEVEL + Math.floor(earnedXp / FALLBACK_XP_PER_LEVEL),
      );
    }

    return calculateLevelFromExperience(
      growthLevels,
      baseExperienceAtStartLevel + earnedXp,
    );
  };

  const { xpInCurrentLevel, xpNeededForNextLevel, xpProgress, nextLevel } = useMemo(() => {
    if (!growthLevels.length) {
      const fallbackXpInCurrentLevel = totalXp % FALLBACK_XP_PER_LEVEL;
      return {
        xpInCurrentLevel: fallbackXpInCurrentLevel,
        xpNeededForNextLevel: FALLBACK_XP_PER_LEVEL,
        xpProgress: (fallbackXpInCurrentLevel / FALLBACK_XP_PER_LEVEL) * 100,
        nextLevel: Math.min(level + 1, MAX_LEVEL),
      };
    }

    const currentLevelExperience = getExperienceForLevel(growthLevels, level);
    if (level >= MAX_LEVEL) {
      return {
        xpInCurrentLevel: totalExperience - currentLevelExperience,
        xpNeededForNextLevel: 0,
        xpProgress: 100,
        nextLevel: MAX_LEVEL,
      };
    }

    const targetNextLevel = level + 1;
    const nextLevelExperience = getExperienceForLevel(
      growthLevels,
      targetNextLevel,
    );
    const xpNeeded = Math.max(nextLevelExperience - currentLevelExperience, 1);
    const xpInLevel = Math.max(totalExperience - currentLevelExperience, 0);

    return {
      xpInCurrentLevel: xpInLevel,
      xpNeededForNextLevel: xpNeeded,
      xpProgress: Math.min((xpInLevel / xpNeeded) * 100, 100),
      nextLevel: targetNextLevel,
    };
  }, [growthLevels, level, totalExperience, totalXp]);

  return {
    level,
    nextLevel,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    xpProgress,
    nextEvolution,
    isGrowthDataLoading,
    growthDataError,
    getLevelForEarnedXp,
  };
}
