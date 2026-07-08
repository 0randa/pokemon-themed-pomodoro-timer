"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth-context";
import {
  todayStr,
  yesterdayStr,
  computeNextStreak,
  shouldGrantShield,
  canActivateShield,
  CHECKIN_XP,
  CHECKIN_POKEDOLLARS,
} from "@/lib/checkin";

const CheckinContext = createContext(null);

export function CheckinProvider({ children }) {
  const { user, loading: authLoading } = useAuth();

  const [streak, setStreak]                 = useState(0);
  const [lastStreakDate, setLastStreakDate]   = useState(null);
  const [shieldsAvailable, setShieldsAvailable] = useState(0);
  const [lastCheckinDate, setLastCheckinDate] = useState(null);
  const [longestStreak, setLongestStreak]   = useState(0);
  const [loaded, setLoaded]                 = useState(false);

  // Load checkin state from Supabase when auth resolves
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Reset on logout
      setStreak(0);
      setLastStreakDate(null);
      setShieldsAvailable(0);
      setLastCheckinDate(null);
      setLongestStreak(0);
      setLoaded(false);
      return;
    }

    supabase
      .from("progress")
      .select("streak, last_streak_date, shields_available, last_checkin_date, longest_streak")
      .single()
      .then(({ data, error }) => {
        if (error) {
          // Leave loaded = false so showCheckinModal stays false on query failure
          console.error("[CheckinContext] Failed to load progress:", error.message);
          return;
        }
        setStreak(data?.streak ?? 0);
        setLastStreakDate(data?.last_streak_date ?? null);
        setShieldsAvailable(data?.shields_available ?? 0);
        setLastCheckinDate(data?.last_checkin_date ?? null);
        setLongestStreak(data?.longest_streak ?? 0);
        setLoaded(true);
      });
  }, [user, authLoading]);

  // True when the user is logged in, progress is loaded, and today's check-in is unclaimed
  const showCheckinModal = loaded && Boolean(user) && lastCheckinDate !== todayStr();

  const claimCheckin = useCallback(async () => {
    const today = todayStr();
    const { streak: newStreak, longest: newLongest } = computeNextStreak(
      streak, lastStreakDate, today, longestStreak,
    );
    const grantShield = shouldGrantShield(lastCheckinDate, today);
    const newShields  = grantShield ? Math.min(1, shieldsAvailable + 1) : shieldsAvailable;

    // Update local state immediately
    setStreak(newStreak);
    setLastStreakDate(today);
    setShieldsAvailable(newShields);
    setLastCheckinDate(today);
    setLongestStreak(newLongest);

    // Persist to Supabase using the context user — avoids a network-bound
    // getUser() call that also contends for the Supabase auth lock.
    if (user) {
      await supabase.from("progress").upsert({
        id: user.id,
        streak: newStreak,
        last_streak_date: today,
        shields_available: newShields,
        last_checkin_date: today,
        longest_streak: newLongest,
        updated_at: new Date().toISOString(),
      });
    }

    // Notify App.jsx to apply XP + Pokedollar rewards via event bus
    window.dispatchEvent(
      new CustomEvent("pomopet:checkin-claimed", {
        detail: { xp: CHECKIN_XP, pokedollars: CHECKIN_POKEDOLLARS },
      })
    );
  }, [streak, lastStreakDate, shieldsAvailable, lastCheckinDate, longestStreak, user]);

  const activateShield = useCallback(async () => {
    const today = todayStr();
    if (!canActivateShield(shieldsAvailable, lastStreakDate, today)) return;

    const yesterday  = yesterdayStr();
    const newShields = shieldsAvailable - 1;

    setShieldsAvailable(newShields);
    setLastStreakDate(yesterday);

    if (user) {
      await supabase.from("progress").upsert({
        id: user.id,
        shields_available: newShields,
        last_streak_date: yesterday,
        updated_at: new Date().toISOString(),
      });
    }
  }, [shieldsAvailable, lastStreakDate, user]);

  const value = {
    streak,
    longestStreak,
    shieldsAvailable,
    lastStreakDate,
    showCheckinModal,
    claimCheckin,
    activateShield,
    canUseShield: canActivateShield(shieldsAvailable, lastStreakDate, todayStr()),
  };

  return (
    <CheckinContext.Provider value={value}>
      {children}
    </CheckinContext.Provider>
  );
}

/** Hook to consume checkin state anywhere in the tree. */
export function useCheckin() {
  const ctx = useContext(CheckinContext);
  if (!ctx) throw new Error("useCheckin must be used inside CheckinProvider");
  return ctx;
}
