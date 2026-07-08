"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth-context";
import { useCheckin } from "@/context/checkin-context";
import { clearGuestData, loadGuestData, saveGuestData } from "@/lib/guest-storage";
import { loadUserProgress, saveUserProgress } from "@/lib/user-progress";
import StudyShell from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const {
    streak,
    longestStreak,
    shieldsAvailable,
    activateShield,
    canUseShield,
  } = useCheckin();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [savingActive, setSavingActive] = useState(false);
  const [error, setError] = useState("");
  const [party, setParty] = useState([]);
  const [activePokemon, setActivePokemonLocal] = useState(null);
  const [totalXp, setTotalXp] = useState(0);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (user) {
      loadUserProgress().then(
        ({ activePokemon: ap, caughtPokemon, totalXp: xp, pomodorosCompleted: pc }) => {
          setActivePokemonLocal(ap);
          setParty(caughtPokemon ?? []);
          setTotalXp(xp ?? 0);
          setPomodorosCompleted(pc ?? 0);
        },
      );
    } else {
      const saved = loadGuestData();
      setActivePokemonLocal(saved?.activePokemon ?? null);
      setParty(saved?.caughtPokemon ?? []);
      setTotalXp(saved?.totalXp ?? 0);
      setPomodorosCompleted(saved?.pomodorosCompleted ?? 0);
    }
  }, [user, loading]);

  const { partyPokemon, boxedPokemon } = useMemo(() => {
    const all = Array.isArray(party) ? party : [];
    return {
      partyPokemon: all.slice(0, 6),
      boxedPokemon: all.slice(6),
    };
  }, [party]);

  const setActivePokemon = async (pokemon) => {
    if (!pokemon) return;
    setActivePokemonLocal(pokemon);

    if (user) {
      setSavingActive(true);
      setError("");
      try {
        await saveUserProgress({ userId: user.id, activePokemon: pokemon, totalXp, pomodorosCompleted });
      } catch (e) {
        setError(e?.message ?? "Could not update active Pokémon.");
      } finally {
        setSavingActive(false);
      }
    } else {
      const existing = loadGuestData() ?? {};
      saveGuestData({ ...existing, activePokemon: pokemon });
    }
  };

  if (loading) {
    return (
      <StudyShell>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="pt-5">
              <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">Loading…</p>
            </CardContent>
          </Card>
        </div>
      </StudyShell>
    );
  }

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("delete_own_account");
    if (rpcError) {
      setDeleting(false);
      setError(rpcError.message);
      return;
    }
    await signOut();
    clearGuestData();
    router.push("/");
  };

  return (
    <StudyShell>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Badge variant="red">{user ? "Account Settings" : "Guest Trainer"}</Badge>
        </div>

        {/* Trainer Info */}
        {user ? (
          <Card>
            <CardHeader>
              <CardTitle>Trainer Info</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-pixel-body text-[22px]" style={{ color: "var(--poke-blue)" }}>
                {user.email}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Trainer Info</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">
                Playing as a guest.{" "}
                <Link href="/login" className="text-[var(--poke-blue)] hover:underline">
                  Log in
                </Link>{" "}
                to save your progress permanently.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Party */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Your Party</CardTitle>
              <Badge variant={partyPokemon.length >= 6 ? "red" : "outline"}>
                {partyPokemon.length}/6
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {partyPokemon.length === 0 ? (
              <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">
                No caught Pokémon yet. Complete pomodoros to encounter wild Pokémon!
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {partyPokemon.map((pokemon, i) => {
                  const isActive = activePokemon?.speciesName === pokemon.speciesName;
                  return (
                    <div
                      key={i}
                      className={[
                        "flex flex-col items-center p-3 text-center",
                        "border-[2px] shadow-[inset_1px_1px_0_var(--window-highlight),inset_-1px_-1px_0_var(--window-shadow)]",
                        isActive
                          ? "border-[var(--poke-blue)] bg-[rgba(56,104,176,0.06)]"
                          : "border-[var(--window-border)] bg-[var(--window-bg)]",
                        "cursor-pointer select-none",
                      ].join(" ")}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isActive}
                      aria-label={`Set ${pokemon.label} as active Pokémon`}
                      onClick={() => setActivePokemon(pokemon)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActivePokemon(pokemon);
                        }
                      }}
                    >
                      {isActive && (
                        <Badge variant="blue" className="mb-2 text-[7px]">
                          Active
                        </Badge>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pokemon.sprite}
                        alt={pokemon.label}
                        className="w-16 h-16 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                      <p className="font-pixel-body text-[18px] text-[var(--text-dark)] mt-1">
                        {pokemon.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="font-pixel-body text-[16px] text-[var(--text-muted)] mt-3">
              Click a Pokémon to set it as your active companion.
              {savingActive ? " Saving…" : ""}
            </p>
            {boxedPokemon.length > 0 ? (
              <p className="font-pixel-body text-[16px] text-[var(--text-muted)] mt-1">
                {boxedPokemon.length} Pokémon in your{" "}
                <Link href="/box" className="text-[var(--poke-blue)] hover:underline">
                  Box
                </Link>
                .
              </p>
            ) : null}
            {error ? (
              <p className="font-pixel-body text-[16px] mt-2" style={{ color: "var(--poke-red)" }}>
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Streak — logged-in only */}
        {user && (
          <Card>
            <CardHeader>
              <CardTitle>Streak</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-6">
                <div>
                  <p className="font-pixel-body text-[16px] text-[var(--text-muted)]">Current</p>
                  <p className="font-pixel-body text-[22px]" style={{ color: "var(--poke-blue)" }}>
                    🔥 {streak} day{streak !== 1 ? "s" : ""}
                  </p>
                </div>
                <div>
                  <p className="font-pixel-body text-[16px] text-[var(--text-muted)]">Best</p>
                  <p className="font-pixel-body text-[22px]" style={{ color: "var(--poke-blue)" }}>
                    {longestStreak} day{longestStreak !== 1 ? "s" : ""}
                  </p>
                </div>
                <div>
                  <p className="font-pixel-body text-[16px] text-[var(--text-muted)]">Shields</p>
                  <p className="font-pixel-body text-[22px]">
                    {shieldsAvailable > 0 ? "🛡️" : "—"}
                  </p>
                </div>
              </div>
              {shieldsAvailable > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="font-pixel-body text-[18px] text-[var(--text-muted)]">
                      A streak shield lets you protect your streak for one missed day.
                      Activate it the day after you missed. You can hold at most 1 shield at a time — a new one is granted on your first check-in each week.
                    </p>
                    <Button
                      variant="outline"
                      onClick={activateShield}
                      disabled={!canUseShield}
                    >
                      Use Shield
                    </Button>
                    {!canUseShield && (
                      <p className="font-pixel-body text-[16px] text-[var(--text-muted)]">
                        Shield can only be used after missing exactly one day.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Danger Zone — logged-in only */}
        {user && (
          <Card className="border-[var(--poke-red)]!">
            <CardHeader>
              <CardTitle style={{ color: "var(--poke-red)" }}>Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">
                Permanently delete your account and all saved data. This cannot be undone.
              </p>
              <Separator />
              <div className="space-y-2">
                <Label>
                  Type{" "}
                  <span className="font-pixel text-[8px] text-[var(--poke-red)]">DELETE</span>{" "}
                  to confirm:
                </Label>
                <Input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="max-w-[200px]"
                  style={{ borderColor: confirmText === "DELETE" ? "var(--poke-red)" : undefined }}
                />
              </div>
              {error && (
                <p className="font-pixel-body text-[18px]" style={{ color: "var(--poke-red)" }}>
                  {error}
                </p>
              )}
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={confirmText !== "DELETE" || deleting}
              >
                {deleting ? "Deleting…" : "Delete My Account"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </StudyShell>
  );
}
