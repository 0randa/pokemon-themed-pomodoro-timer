"use client";

import { useEffect, useMemo, useState } from "react";
import StarterSelection from "@/components/starter-selection";
import StudyDashboard from "@/components/study-dashboard";
import StudyShell from "@/components/study-shell";
import { WildEncounterModal } from "@/components/wild-encounter-modal";
import { CheckinModal } from "@/components/checkin-modal";
import { useAuth } from "@/context/auth-context";
import { useCheckin } from "@/context/checkin-context";
import { usePokemonProgress } from "@/hooks/use-pokemon-progress";
import { useSessionState } from "@/hooks/use-session-state";
import { useStarterSelection } from "@/hooks/use-starter-selection";
import { useWildEncounter } from "@/hooks/use-wild-encounter";
import { useWildPool } from "@/hooks/use-wild-pool";
import { loadGuestData, saveGuestData } from "@/lib/guest-storage";
import {
  loadUserProgress,
  saveUserProgress,
  addCaughtPokemon,
  reorderCaughtPokemon,
  normalizeStorageOrder,
  loadInventory,
  saveInventoryItem,
} from "@/lib/user-progress";
import {
  MAX_LEVEL,
  MAX_PARTY_SIZE,
  START_LEVEL,
  getPokemonAssets,
} from "@/lib/pokemon";
import { REGIONS } from "@/lib/regions";
import { POKEDOLLARS_PER_POMODORO, getRequiredItem } from "@/lib/shop";

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { streak: checkinStreak, showCheckinModal, claimCheckin } = useCheckin();

  const [activePokemon, setActivePokemon] = useState(null);
  const [caughtPokemon, setCaughtPokemon] = useState([]);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [testingMode, setTestingMode] = useState(() =>
    Boolean(loadGuestData()?.testingMode),
  );
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [pokedollars, setPokedollars] = useState(0);
  const [inventory, setInventory] = useState([]);

  const regionData = REGIONS.find((r) => r.regionId === selectedRegion);
  const starters = regionData?.starters ?? [];

  const { wildPool } = useWildPool(selectedRegion);

  const { previewStarter, previewStarterData, playingStarter, playStarterCry } =
    useStarterSelection(starters);

  const {
    tasks,
    pomodorosStarted,
    pomodorosCompleted,
    setPomodorosCompleted,
    tasksCompleted,
    availableTaskClaims,
    totalXp,
    setTotalXp,
    statusMessage,
    streak,
    dailyXpEarned,
    dailyXpDate,
    setWelcomeMessage,
    updateStatusMessage,
    handlePomodoroStart,
    handlePomodoroComplete,
    handlePomodoroSkip,
    handleFlowComplete,
    handleTaskCreate,
    handleTaskComplete,
    handleClearBoard,
  } = useSessionState({ initialStreak: checkinStreak });

  const {
    wildPokemon,
    catchResult,
    triggerEncounterChance,
    attemptCatch,
    dismissEncounter,
  } = useWildEncounter({
    testingMode,
    partySize: Math.min(caughtPokemon.length, MAX_PARTY_SIZE),
    wildPool,
    regionId: selectedRegion,
  });

  useEffect(() => {
    const onCheckinClaimed = (e) => {
      const { xp = 0, pokedollars: pd = 0 } = e.detail ?? {};
      if (xp)  setTotalXp((prev) => prev + xp);
      if (pd)  setPokedollars((prev) => prev + pd);
    };

    window.addEventListener("pomopet:checkin-claimed", onCheckinClaimed);
    return () => window.removeEventListener("pomopet:checkin-claimed", onCheckinClaimed);
  }, []);

  useEffect(() => {
    const onToggle = (e) => setTestingMode(Boolean(e.detail?.enabled));
    const onStorage = (e) => {
      if (e.key !== "pomopet_guest") return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : null;
        setTestingMode(Boolean(next?.testingMode));
      } catch {}
    };

    window.addEventListener("pomopet:testing-mode", onToggle);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pomopet:testing-mode", onToggle);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Load progress once auth resolves, resetting state first on every change
  useEffect(() => {
    if (authLoading) return;

    // Always reset to a clean slate before loading (handles logout correctly)
    setActivePokemon(null);
    setCaughtPokemon([]);
    setTotalXp(0);
    setPomodorosCompleted(0);
    setSelectedRegion(null);
    setPokedollars(0);
    setInventory([]);
    setProgressLoaded(false);

    if (user) {
      Promise.all([loadUserProgress(), loadInventory(user.id)]).then(
        ([{
          activePokemon: ap,
          totalXp: xp,
          pomodorosCompleted: pc,
          pokedollars: pd,
          caughtPokemon: caught,
          regionId: rid,
        }, inv]) => {
          if (ap) setActivePokemon(ap);
          setTotalXp(xp);
          setPomodorosCompleted(pc);
          setPokedollars(pd ?? 0);
          setCaughtPokemon(caught ?? []);
          setInventory(inv ?? []);
          if (rid) setSelectedRegion(rid);
          setProgressLoaded(true);
        },
      );
    } else {
      const saved = loadGuestData();
      if (saved?.activePokemon) setActivePokemon(saved.activePokemon);
      if (saved?.totalXp) setTotalXp(saved.totalXp);
      if (saved?.pomodorosCompleted)
        setPomodorosCompleted(saved.pomodorosCompleted);
      setCaughtPokemon(saved?.caughtPokemon ?? []);
      if (saved?.regionId) setSelectedRegion(saved.regionId);
      setPokedollars(saved?.pokedollars ?? 0);
      setInventory(saved?.inventory ?? []);
      setProgressLoaded(true);
    }
  }, [user, authLoading]);

  // Persist progress whenever it changes
  useEffect(() => {
    if (!progressLoaded) return;

    if (user) {
      saveUserProgress({ userId: user.id, activePokemon, totalXp, pomodorosCompleted, pokedollars, regionId: selectedRegion });
    } else {
      const existingGuestData = loadGuestData() ?? {};
      saveGuestData({
        ...existingGuestData,
        activePokemon,
        totalXp,
        pomodorosCompleted,
        pokedollars,
        inventory,
        caughtPokemon,
        regionId: selectedRegion,
      });
    }
  }, [
    activePokemon,
    totalXp,
    pomodorosCompleted,
    pokedollars,
    inventory,
    caughtPokemon,
    selectedRegion,
    user,
    progressLoaded,
  ]);

  const {
    level,
    nextLevel,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    xpProgress,
    nextEvolution,
    isGrowthDataLoading,
    growthDataError,
    getLevelForEarnedXp,
  } = usePokemonProgress({ activePokemon, totalXp });

  const greetingLabel = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Morning Momentum";
    if (hour < 18) return "Afternoon Flow";
    return "Evening Deep Focus";
  }, []);

  const beginSession = () => {
    setActivePokemon(previewStarterData);
    // Starter should always appear in the party list (guest + logged-in UI state).
    setCaughtPokemon((prev) => {
      const alreadyInParty = prev.some(
        (p) => p?.speciesName === previewStarterData?.speciesName,
      );
      return alreadyInParty ? prev : [previewStarterData, ...prev];
    });

    // Persist the starter as a real caught_pokemon row so it survives active-pokemon switches.
    if (user) {
      const alreadyPersisted = caughtPokemon.some(
        (p) => p?.speciesName === previewStarterData?.speciesName && p?.id,
      );
      if (!alreadyPersisted) {
        // Shift existing pokemon storage indices up by 1 to make room at slot 0.
        const existingWithIds = caughtPokemon.filter((p) => p?.id);
        if (existingWithIds.length > 0) {
          reorderCaughtPokemon(
            existingWithIds.map((p) => ({
              id: p.id,
              speciesName: p.speciesName,
              storageIndex: (p.storageIndex ?? 0) + 1,
            })),
            user.id,
          );
        }
        addCaughtPokemon(previewStarterData, { storageIndex: 0, userId: user.id });
      }
    }

    setWelcomeMessage({
      starterLabel: previewStarterData.label,
      startLevel: START_LEVEL,
    });
  };

  const completeTask = (taskId) => {
    handleTaskComplete({
      taskId,
      activePokemonLabel: activePokemon?.label,
      currentLevel: level,
      resolveLevelForEarnedXp: getLevelForEarnedXp,
    });
  };

  const onPomodoroComplete = () => {
    handlePomodoroComplete();
    setPokedollars((prev) => prev + POKEDOLLARS_PER_POMODORO);
    if (activePokemon) triggerEncounterChance();
  };

  const onPomodoroSkip = (ratio) => {
    handlePomodoroSkip(ratio);
  };

  const onFlowComplete = (studiedSecs) => {
    handleFlowComplete(studiedSecs);
    // Award pokedollars proportional to time studied (same rate as pomodoro)
    const earned = Math.max(1, Math.round((studiedSecs / (25 * 60)) * POKEDOLLARS_PER_POMODORO));
    setPokedollars((prev) => prev + earned);
    if (activePokemon) triggerEncounterChance();
  };

  const handleCatch = () => {
    const caught = attemptCatch();
    if (!caught) return;

    const nextCaught = [...caughtPokemon, caught];
    setCaughtPokemon(nextCaught);
    if (user) addCaughtPokemon(caught, { storageIndex: nextCaught.length - 1, userId: user.id });
  };

  const handleSetCaughtActive = () => {
    if (!wildPokemon) {
      dismissEncounter();
      return;
    }

    const partyFull = caughtPokemon.length >= MAX_PARTY_SIZE;

    if (partyFull && activePokemon) {
      // Find current active's slot in party (first 6).
      let activeIdx = caughtPokemon.findIndex(
        (p) => p?.speciesName === activePokemon.speciesName,
      );
      // Fallback: if active isn't in party, use last party slot.
      if (activeIdx < 0 || activeIdx >= MAX_PARTY_SIZE) {
        activeIdx = MAX_PARTY_SIZE - 1;
      }

      // The newly caught Pokémon is at the end (just appended by handleCatch).
      const newIdx = caughtPokemon.length - 1;

      // Swap: new catch takes active's party slot; old active goes to end (Box).
      const next = [...caughtPokemon];
      next[activeIdx] = next[newIdx];
      next[newIdx] = caughtPokemon[activeIdx];

      const normalized = normalizeStorageOrder(next);
      setCaughtPokemon(normalized);

      if (user) {
        reorderCaughtPokemon(
          normalized
            .filter((p) => p?.id)
            .map((p) => ({
              id: p.id,
              speciesName: p.speciesName,
              storageIndex: p.storageIndex,
            })),
          user.id,
        );
      }
    }

    setActivePokemon(wildPokemon);
    dismissEncounter();
  };

  const canEvolveByLevel =
    Boolean(nextEvolution) &&
    typeof nextEvolution.minLevel === "number" &&
    level >= nextEvolution.minLevel;

  const hasRequiredItem = Boolean(
    nextEvolution?.requiredShopItem &&
    inventory.some(
      (i) => i.itemId === nextEvolution.requiredShopItem.id && i.quantity > 0,
    ),
  );

  const canEvolve = nextEvolution
    ? nextEvolution.requiredShopItem
      ? hasRequiredItem
      : canEvolveByLevel
    : false;

  const handleEvolve = () => {
    if (!nextEvolution) return;

    // Item-based evolution (stone, link cable, soothe bell)
    if (nextEvolution.requiredShopItem) {
      if (!hasRequiredItem) {
        updateStatusMessage(
          `You need a ${nextEvolution.requiredShopItem.label} to evolve ${activePokemon?.label ?? "your Pokémon"}. Visit the PokéMart!`,
        );
        return;
      }

      // Consume the item
      const itemId = nextEvolution.requiredShopItem.id;
      const entry = inventory.find((i) => i.itemId === itemId);
      const newQuantity = (entry?.quantity ?? 1) - 1;
      const newInventory = newQuantity <= 0
        ? inventory.filter((i) => i.itemId !== itemId)
        : inventory.map((i) => i.itemId === itemId ? { ...i, quantity: newQuantity } : i);
      setInventory(newInventory);
      if (user) saveInventoryItem(itemId, newQuantity, user.id);
    } else {
      // Level-based evolution
      if (typeof nextEvolution.minLevel !== "number") {
        updateStatusMessage(
          `${activePokemon?.label ?? "Your Pokémon"} cannot evolve by level in this line.`,
        );
        return;
      }

      if (level < nextEvolution.minLevel) {
        updateStatusMessage(
          `${activePokemon?.label ?? "Your Pokémon"} evolves at level ${nextEvolution.minLevel}.`,
        );
        return;
      }
    }

    const evolvedPokemon = {
      key: nextEvolution.speciesName,
      speciesName: nextEvolution.speciesName,
      pokemonId: nextEvolution.pokemonId,
      label: nextEvolution.label,
      ...getPokemonAssets(nextEvolution.pokemonId, selectedRegion),
    };

    setActivePokemon(evolvedPokemon);
    updateStatusMessage(
      `${activePokemon?.label ?? "Your Pokémon"} evolved into ${nextEvolution.label}!`,
    );
  };

  // Wait for auth + progress before rendering
  if (authLoading || !progressLoaded) {
    return null;
  }

  if (!activePokemon) {
    return (
      <StudyShell>
        <StarterSelection
          regions={REGIONS}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
          onClearRegion={() => setSelectedRegion(null)}
          starters={starters}
          previewStarterKey={previewStarter}
          playingStarterKey={playingStarter}
          onPreviewStarter={playStarterCry}
          onBeginSession={beginSession}
          previewStarterLabel={previewStarterData?.label ?? ""}
        />
        {showCheckinModal && (
          <CheckinModal
            streak={checkinStreak}
            onClaim={claimCheckin}
          />
        )}
      </StudyShell>
    );
  }

  return (
    <StudyShell>
      <StudyDashboard
        greetingLabel={greetingLabel}
        activePokemon={activePokemon}
        level={level}
        openTasks={tasks.filter((task) => !task.done).length}
        availableTaskClaims={availableTaskClaims}
        statusMessage={statusMessage}
        onPomodoroStart={handlePomodoroStart}
        onPomodoroComplete={onPomodoroComplete}
        onPomodoroSkip={onPomodoroSkip}
        onFlowComplete={onFlowComplete}
        companionProps={{
          activePokemon,
          level,
          xpInCurrentLevel,
          xpNeededForNextLevel,
          xpProgress,
          nextLevel,
          maxLevel: MAX_LEVEL,
          isGrowthDataLoading,
          growthDataError,
          nextEvolution,
          canEvolve,
          onEvolve: handleEvolve,
          streak,
          dailyXpEarned,
          availableTaskClaims,
          totalXp,
          pokedollars,
        }}
        taskBoardProps={{
          tasks,
          onAddTask: handleTaskCreate,
          onCompleteTask: completeTask,
          onClearBoard: handleClearBoard,
          canCompleteTask: availableTaskClaims > 0,
          stats: {
            sessionsStarted: pomodorosStarted,
            sessionsCompleted: pomodorosCompleted,
            tasksCompleted,
            currentLevel: level,
          },
        }}
      />

      <WildEncounterModal
        wildPokemon={wildPokemon}
        catchResult={catchResult}
        partyFull={caughtPokemon.length >= MAX_PARTY_SIZE}
        onAttemptCatch={handleCatch}
        onSetActive={handleSetCaughtActive}
        onDismiss={dismissEncounter}
      />
      {showCheckinModal && (
        <CheckinModal
          streak={checkinStreak}
          onClaim={claimCheckin}
        />
      )}
    </StudyShell>
  );
}
