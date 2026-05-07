"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useTimerTabTitle } from "@/hooks/use-timer-tab-title";
import { playVictorySound, stopVictorySound, playBreakMusic, pauseBreakMusic, resumeBreakMusic, stopBreakMusic, stopAllAudio, playHealSound, getMuted, setMuted } from "@/lib/victory-sound";
import { TIMER_NOTIFICATION_TAGS, cancelTimerNotifications, requestNotificationPermission, scheduleTimerNotification, sendTimerNotification, supportsScheduledTimerNotifications } from "@/lib/notifications";
import { didDeadlineExpireWhileBackgrounded, isPageBackgrounded } from "@/lib/page-attention";
import { loadSessionData, saveSessionData } from "@/lib/session-storage";

const TEST_FOCUS_SECS = 2;
const TEST_BREAK_SECS = 1;
const POMODORO_NOTIFICATION_TAG_LIST = [
  TIMER_NOTIFICATION_TAGS.pomodoroFocus,
  TIMER_NOTIFICATION_TAGS.pomodoroBreak,
];

export default function TimerComp({
  focusMinutes = 25,
  shortBreakMinutes = 5,
  longBreakMinutes = 15,
  testingMode = false,
  onPomodoroStart,
  onPomodoroComplete,
  onPomodoroSkip,
}) {
  const focusSecs      = testingMode ? TEST_FOCUS_SECS : focusMinutes * 60;
  const shortBreakSecs = testingMode ? TEST_BREAK_SECS : shortBreakMinutes * 60;
  const longBreakSecs  = testingMode ? TEST_BREAK_SECS : longBreakMinutes * 60;

  // Restore saved timer state (only if timer settings still match)
  const savedTimerRef = useRef(undefined);
  if (savedTimerRef.current === undefined) {
    const t = loadSessionData()?.timer;
    if (t && t.focusSecs === focusSecs && t.shortBreakSecs === shortBreakSecs && t.longBreakSecs === longBreakSecs) {
      if (t.isRunning && t.deadline) {
        const remaining = Math.round((t.deadline - Date.now()) / 1000);
        savedTimerRef.current = { ...t, secondsLeft: remaining > 0 ? remaining : 0, isRunning: true };
      } else {
        savedTimerRef.current = t;
      }
    } else {
      savedTimerRef.current = null;
    }
  }
  const _st = savedTimerRef.current;

  const [mode, setMode]               = useState(_st?.mode ?? "focus");
  const [secondsLeft, setSecondsLeft] = useState(_st?.secondsLeft ?? focusSecs);
  const [isRunning, setIsRunning]     = useState(_st?.isRunning ?? false);
  const [canStartBreak, setCanStartBreak] = useState(_st?.canStartBreak ?? false);
  const [pomodoroCount, setPomodoroCount] = useState(_st?.pomodoroCount ?? 0);
  const [isMuted, setIsMuted]         = useState(() => getMuted());
  const completionFired = useRef(false);
  const didMount = useRef(false);
  const backgroundedAtRef = useRef(null);
  const completedInBackgroundRef = useRef(false);

  const toggleMute = () => {
    const next = !isMuted;
    setMuted(next);
    setIsMuted(next);
  };

  // Reset when timer settings change (skip first mount to preserve restored state)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return () => { didMount.current = false; }; // reset for StrictMode remount cycle
    }
    setIsRunning(false);
    setMode("focus");
    setCanStartBreak(false);
    setSecondsLeft(focusSecs);
    setPomodoroCount(0);
    completionFired.current = false;
  }, [focusSecs, shortBreakSecs, longBreakSecs]);

  // Persist timer state on key transitions
  useEffect(() => {
    saveSessionData({
      timer: {
        mode,
        secondsLeft,
        isRunning,
        pomodoroCount,
        canStartBreak,
        deadline: isRunning ? Date.now() + secondsLeft * 1000 : null,
        focusSecs,
        shortBreakSecs,
        longBreakSecs,
      },
    });
  }, [mode, isRunning, pomodoroCount, canStartBreak, focusSecs, shortBreakSecs, longBreakSecs]);

  const deadlineRef = useRef(null);

  useEffect(() => {
    if (!isRunning) {
      deadlineRef.current = null;
      return undefined;
    }

    deadlineRef.current = Date.now() + secondsLeft * 1000;
    const interval = setInterval(() => {
      const remaining = Math.round((deadlineRef.current - Date.now()) / 1000);
      setSecondsLeft(remaining <= 0 ? 0 : remaining);
    }, 500);
    return () => clearInterval(interval);
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const syncFromPageAttention = () => {
      const now = Date.now();

      if (isPageBackgrounded()) {
        backgroundedAtRef.current ??= now;
        return;
      }

      if (
        isRunning &&
        didDeadlineExpireWhileBackgrounded({
          deadlineMs: deadlineRef.current,
          backgroundedAtMs: backgroundedAtRef.current,
          nowMs: now,
        })
      ) {
        completedInBackgroundRef.current = true;
      }

      backgroundedAtRef.current = null;

      if (!isRunning || deadlineRef.current == null) return;

      const remaining = Math.round((deadlineRef.current - now) / 1000);
      setSecondsLeft(remaining <= 0 ? 0 : remaining);
    };

    syncFromPageAttention();
    window.addEventListener("focus", syncFromPageAttention);
    window.addEventListener("blur", syncFromPageAttention);
    document.addEventListener("visibilitychange", syncFromPageAttention);

    return () => {
      window.removeEventListener("focus", syncFromPageAttention);
      window.removeEventListener("blur", syncFromPageAttention);
      document.removeEventListener("visibilitychange", syncFromPageAttention);
    };
  }, [isRunning]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const syncScheduledNotification = () => {
      if (!isRunning || deadlineRef.current == null) {
        void cancelTimerNotifications(POMODORO_NOTIFICATION_TAG_LIST);
        return;
      }

      if (!isPageBackgrounded()) {
        void cancelTimerNotifications(POMODORO_NOTIFICATION_TAG_LIST);
        return;
      }

      const scheduledNotification = mode === "focus"
        ? {
            tag: TIMER_NOTIFICATION_TAGS.pomodoroFocus,
            title: "Focus session complete!",
            body: "Great work, Trainer! Time to take a break.",
          }
        : {
            tag: TIMER_NOTIFICATION_TAGS.pomodoroBreak,
            title: "Break's over!",
            body: "You're healed up — time to get back to it.",
          };

      void scheduleTimerNotification({
        ...scheduledNotification,
        timestamp: deadlineRef.current,
      });
    };

    syncScheduledNotification();
    window.addEventListener("focus", syncScheduledNotification);
    window.addEventListener("blur", syncScheduledNotification);
    document.addEventListener("visibilitychange", syncScheduledNotification);

    return () => {
      window.removeEventListener("focus", syncScheduledNotification);
      window.removeEventListener("blur", syncScheduledNotification);
      document.removeEventListener("visibilitychange", syncScheduledNotification);
    };
  }, [isRunning, mode]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const label = mode === "focus" ? "Focus" : "Break";
  const activeTitle = isRunning ? `${mm}:${ss} — ${label} | PomoPet` : null;
  const { showCompletionTitle } = useTimerTabTitle(activeTitle);

  useEffect(() => {
    if (secondsLeft > 0) {
      completionFired.current = false;
      return;
    }
    if (!isRunning || completionFired.current) return;

    const completedInBackground =
      completedInBackgroundRef.current
      || didDeadlineExpireWhileBackgrounded({
        deadlineMs: deadlineRef.current,
        backgroundedAtMs: backgroundedAtRef.current,
      });
    const shouldSendImmediateNotification = !completedInBackground || !supportsScheduledTimerNotifications();

    completionFired.current = true;
    completedInBackgroundRef.current = false;
    backgroundedAtRef.current = null;
    deadlineRef.current = null;
    setIsRunning(false);
    void cancelTimerNotifications(POMODORO_NOTIFICATION_TAG_LIST);

    if (mode === "focus") {
      playVictorySound();
      if (shouldSendImmediateNotification) {
        sendTimerNotification("Focus session complete!", "Great work, Trainer! Time to take a break.");
      }
      showCompletionTitle("Focus complete! | PomoPet");
      setPomodoroCount((c) => c + 1);
      setCanStartBreak(true);
      onPomodoroComplete?.();
    } else {
      stopBreakMusic();
      if (!completedInBackground) playHealSound();
      if (shouldSendImmediateNotification) {
        sendTimerNotification("Break's over!", "You're healed up — time to get back to it.");
      }
      showCompletionTitle("Break over! | PomoPet");
      if (mode === "longBreak") setPomodoroCount(0);
      setMode("focus");
      setCanStartBreak(false);
      setSecondsLeft(focusSecs);
    }
  }, [secondsLeft, isRunning, mode, focusSecs, onPomodoroComplete, showCompletionTitle]);

  const totalForMode = mode === "focus" ? focusSecs : mode === "longBreak" ? longBreakSecs : shortBreakSecs;
  const progress = useMemo(() => {
    const elapsed = totalForMode - secondsLeft;
    return (elapsed / totalForMode) * 100;
  }, [secondsLeft, totalForMode]);

  const isLongBreakDue = pomodoroCount > 0 && pomodoroCount % 4 === 0;
  const countInCycle = pomodoroCount % 4;

  const startBreak = (type) => {
    stopVictorySound();
    completedInBackgroundRef.current = false;
    const breakMode = type === "long" ? "longBreak" : "shortBreak";
    setMode(breakMode);
    setSecondsLeft(type === "long" ? longBreakSecs : shortBreakSecs);
    setCanStartBreak(false);
    completionFired.current = false;
    playBreakMusic(breakMode);
    setIsRunning(true);
  };

  const toggleTimer = async () => {
    if (isRunning) {
      setIsRunning(false);
      if (mode !== "focus") pauseBreakMusic();
      return;
    }
    if (mode === "focus" && canStartBreak) { startBreak(isLongBreakDue ? "long" : "short"); return; }
    if (mode !== "focus") { resumeBreakMusic(); }
    if (mode === "focus" && (secondsLeft === focusSecs || secondsLeft === 0)) { onPomodoroStart?.(); }
    completedInBackgroundRef.current = false;
    await requestNotificationPermission();
    setIsRunning(true);
  };

  const skipTimer = () => {
    stopAllAudio();
    setIsRunning(false);
    completionFired.current = true;
    completedInBackgroundRef.current = false;
    backgroundedAtRef.current = null;
    deadlineRef.current = null;
    void cancelTimerNotifications(POMODORO_NOTIFICATION_TAG_LIST);
    if (mode === "focus") {
      const elapsed = focusSecs - secondsLeft;
      const ratio = focusSecs > 0 ? elapsed / focusSecs : 0;
      setPomodoroCount((c) => c + 1);
      setCanStartBreak(true);
      setSecondsLeft(0);
      onPomodoroSkip?.(ratio);
    } else {
      playHealSound();
      if (mode === "longBreak") setPomodoroCount(0);
      setMode("focus");
      setCanStartBreak(false);
      setSecondsLeft(focusSecs);
    }
  };

  const resetTimer = () => {
    stopAllAudio();
    setIsRunning(false);
    backgroundedAtRef.current = null;
    completedInBackgroundRef.current = false;
    deadlineRef.current = null;
    void cancelTimerNotifications(POMODORO_NOTIFICATION_TAG_LIST);
    setMode("focus");
    setCanStartBreak(false);
    setSecondsLeft(focusSecs);
    setPomodoroCount(0);
    completionFired.current = false;
  };

  const primaryLabel = () => {
    if (isRunning) return mode === "focus" ? "Pause" : "Pause Break";
    if (mode === "focus" && canStartBreak) return isLongBreakDue ? "Long Break" : "Short Break";
    if (mode !== "focus") return "Resume Break";
    return secondsLeft === focusSecs ? "Start" : "Resume";
  };

  const modeLabel =
    mode === "focus" ? "Focus Battle" : mode === "longBreak" ? "Camp Rest" : "Potion Break";

  const modeDescription =
    mode === "focus"
      ? "Lock in. Give it everything you have."
      : mode === "longBreak"
      ? "Long rest — recover fully before the next challenge."
      : "Potion time — rest up and come back stronger.";

  const modeVariant = mode === "focus" ? "red" : "blue";
  const barColor = mode === "focus" ? "bg-[var(--hp-green)]" : "bg-[var(--xp-blue)]";

  return (
    <div
      className={[
        "bg-[var(--window-bg)] border-[2px] border-[var(--window-border)]",
        "shadow-[inset_1px_1px_0_var(--window-highlight),inset_-1px_-1px_0_var(--window-shadow)] p-5",
        isRunning ? "shadow-[inset_2px_2px_0_var(--window-highlight),inset_-2px_-2px_0_var(--window-shadow),8px_8px_0_rgba(0,0,0,0.25)] -translate-x-0.5 -translate-y-0.5" : "",
        "transition-all duration-200"
      ].join(" ")}
    >
      {/* Mode label + session dots */}
      <div className="flex items-center justify-between mb-3">
        <Badge variant={modeVariant}>{modeLabel}</Badge>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="w-3 h-3 rounded-full border-[2px] border-[var(--poke-red)] inline-block transition-colors duration-200"
              style={{ background: i < countInCycle ? "var(--poke-red)" : "transparent" }}
            />
          ))}
        </div>
      </div>

      <p className="font-pixel-body text-[18px] text-[var(--text-muted)] mb-5">{modeDescription}</p>

      {/* Hero timer display */}
      <p
        className="font-pixel text-center leading-none tracking-widest text-[var(--text-dark)]"
        style={{
          fontSize: "clamp(48px, 8vw, 72px)",
          textShadow: "4px 4px 0 rgba(0,0,0,0.08)",
          fontVariantNumeric: "tabular-nums",
        }}
        aria-label={`${mm} minutes and ${ss} seconds remaining`}
        aria-live="off"
        role="timer"
      >
        {mm}:{ss}
      </p>

      <Progress
        value={progress}
        className="mt-5"
        indicatorClassName={barColor}
      />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mt-5">
        <Button
          variant="primary"
          size="lg"
          onClick={toggleTimer}
          className="flex-1 min-w-[120px]"
        >
          {primaryLabel()}
        </Button>
        {(isRunning || mode !== "focus") && (
          <Button variant="secondary" onClick={skipTimer}>
            Skip ▸▸
          </Button>
        )}
        <Button variant="ghost" onClick={resetTimer}>
          Reset
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          aria-label={isMuted ? "Unmute music" : "Mute music"}
        >
          {isMuted
            ? <VolumeX size={16} aria-hidden="true" />
            : <Volume2 size={16} aria-hidden="true" />
          }
        </Button>
      </div>

      {testingMode && (
        <p className="font-pixel-body text-[16px] mt-3" style={{ color: "var(--poke-blue)", opacity: 0.7 }}>
          TEST MODE: {TEST_FOCUS_SECS}s focus / {TEST_BREAK_SECS}s breaks
        </p>
      )}
    </div>
  );
}
