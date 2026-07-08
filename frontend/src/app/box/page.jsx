"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { loadGuestData, saveGuestData } from "@/lib/guest-storage";
import {
  loadUserProgress,
  normalizeStorageOrder,
  reorderCaughtPokemon,
  saveUserProgress,
} from "@/lib/user-progress";
import StudyShell from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MAX_PARTY_SIZE = 6;
const MAX_BOX_SIZE = 30;

export default function BoxPage() {
  const { user, loading } = useAuth();
  const [caughtPokemon, setCaughtPokemon] = useState([]);
  const [activePokemon, setActivePokemon] = useState(null);
  const [totalXp, setTotalXp] = useState(0);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);
  const [savingOrder, setSavingOrder] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dragSource, setDragSource] = useState(null); // { kind: "party"|"box", index: number }
  const [activeBoxIndex, setActiveBoxIndex] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (user) {
      loadUserProgress().then(({ activePokemon: ap, caughtPokemon: caught, totalXp: xp, pomodorosCompleted: pc }) => {
        setActivePokemon(ap);
        setCaughtPokemon(normalizeStorageOrder(caught ?? []));
        setTotalXp(xp ?? 0);
        setPomodorosCompleted(pc ?? 0);
      });
    } else {
      const saved = loadGuestData();
      setActivePokemon(saved?.activePokemon ?? null);
      setCaughtPokemon(normalizeStorageOrder(saved?.caughtPokemon ?? []));
      setTotalXp(saved?.totalXp ?? 0);
      setPomodorosCompleted(saved?.pomodorosCompleted ?? 0);
    }
  }, [user, loading]);

  const { partyPokemon, boxedPokemon } = useMemo(() => {
    const all = Array.isArray(caughtPokemon) ? caughtPokemon : [];
    return {
      partyPokemon: all.slice(0, MAX_PARTY_SIZE),
      boxedPokemon: all.slice(MAX_PARTY_SIZE),
    };
  }, [caughtPokemon]);

  const boxes = useMemo(() => {
    const result = [];
    for (let i = 0; i < boxedPokemon.length; i += MAX_BOX_SIZE) {
      result.push(boxedPokemon.slice(i, i + MAX_BOX_SIZE));
    }
    return result.length ? result : [[]];
  }, [boxedPokemon]);

  useEffect(() => {
    setActiveBoxIndex((prev) => Math.min(prev, boxes.length - 1));
  }, [boxes.length]);

  const currentBox = boxes[activeBoxIndex] ?? [];

  const persistOrder = async (nextList) => {
    setSavingOrder(true);
    setSaveError("");
    try {
      const normalized = normalizeStorageOrder(nextList);
      setCaughtPokemon(normalized);
      if (user) {
        await reorderCaughtPokemon(
          normalized
            .filter((p) => p?.id)
            .map((p) => ({ id: p.id, speciesName: p.speciesName, storageIndex: p.storageIndex })),
          user.id,
        );
      } else {
        const existing = loadGuestData() ?? {};
        saveGuestData({ ...existing, caughtPokemon: normalized });
      }
    } catch (e) {
      setSaveError(e?.message ?? "Could not save order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const setActivePokemonPersisted = async (pokemon) => {
    if (!pokemon) return;
    setActivePokemon(pokemon);
    if (user) {
      try {
        await saveUserProgress({ userId: user.id, activePokemon: pokemon, totalXp, pomodorosCompleted });
      } catch (e) {
        setSaveError(e?.message ?? "Could not update active Pokémon.");
      }
    } else {
      const existing = loadGuestData() ?? {};
      saveGuestData({ ...existing, activePokemon: pokemon });
    }
  };

  const toGlobalIndex = (loc) => {
    if (!loc) return null;
    if (loc.kind === "party") return loc.index;
    return MAX_PARTY_SIZE + activeBoxIndex * MAX_BOX_SIZE + loc.index;
  };

  const handleDrop = async (targetLoc) => {
    const from = dragSource;
    setDragSource(null);
    if (!from) return;
    const fromIndex = toGlobalIndex(from);
    const toIndex = toGlobalIndex(targetLoc);
    if (fromIndex == null || toIndex == null) return;
    if (fromIndex === toIndex) return;

    const next = [...caughtPokemon];
    if (!next[fromIndex] || !next[toIndex]) return;
    const tmp = next[fromIndex];
    next[fromIndex] = next[toIndex];
    next[toIndex] = tmp;
    await persistOrder(next);
  };

  if (loading) {
    return (
      <StudyShell>
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardContent className="pt-5">
              <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">Loading…</p>
            </CardContent>
          </Card>
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline">Box</Badge>
            <p className="font-pixel-body text-[18px] text-[var(--text-muted)]">
              Drag and swap to edit your party. Each box holds up to {MAX_BOX_SIZE}.
            </p>
          </div>
          <Link
            href="/account"
            className="text-[var(--poke-blue)] hover:underline font-pixel text-[10px]"
          >
            Back to Account
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Your Party</CardTitle>
              <Badge variant="outline">
                {partyPokemon.length}/{MAX_PARTY_SIZE}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {partyPokemon.length === 0 ? (
              <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">
                No party Pokémon yet. Catch one to begin.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {partyPokemon.map((pokemon, i) => {
                  const isActive = activePokemon?.speciesName === pokemon.speciesName;
                  return (
                    <div
                      key={`${pokemon.speciesName ?? pokemon.key ?? "p"}-party-${i}`}
                      draggable
                      onDragStart={() => setDragSource({ kind: "party", index: i })}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop({ kind: "party", index: i })}
                      onClick={() => setActivePokemonPersisted(pokemon)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActivePokemonPersisted(pokemon);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isActive}
                      aria-label={`Set ${pokemon.label} as active Pokémon`}
                      className={[
                        "flex flex-col items-center p-3 text-center cursor-move",
                        "border-[2px] shadow-[inset_1px_1px_0_var(--window-highlight),inset_-1px_-1px_0_var(--window-shadow)]",
                        isActive
                          ? "border-[var(--poke-blue)] bg-[rgba(56,104,176,0.06)]"
                          : "border-[var(--window-border)] bg-[var(--window-bg)]",
                      ].join(" ")}
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

            <div className="mt-3">
              <p className="font-pixel-body text-[16px] text-[var(--text-muted)]">
                Tip: drag a party Pokémon onto another to swap.
                {savingOrder ? " Saving…" : ""}
              </p>
              {saveError ? (
                <p
                  className="font-pixel-body text-[16px] mt-1"
                  style={{ color: "var(--poke-red)" }}
                >
                  {saveError}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Stored Pokémon</CardTitle>
              <Badge variant="outline">
                {boxedPokemon.length} · {boxes.length}{" "}
                {boxes.length === 1 ? "box" : "boxes"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {boxedPokemon.length === 0 ? (
              <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">
                Your Box is empty. Catch more Pokémon to store extras here.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {boxes.map((box, index) => {
                    const isSelected = index === activeBoxIndex;
                    const label = `Box ${index + 1}`;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setActiveBoxIndex(index)}
                        className={[
                          "font-pixel text-[10px] px-2 py-1 border-[2px]",
                          "shadow-[inset_1px_1px_0_var(--window-highlight),inset_-1px_-1px_0_var(--window-shadow)]",
                          isSelected
                            ? "border-[var(--poke-blue)] bg-[rgba(56,104,176,0.06)]"
                            : "border-[var(--window-border)] bg-[var(--window-bg)]",
                        ].join(" ")}
                        aria-pressed={isSelected}
                      >
                        {label} ({box.length}/{MAX_BOX_SIZE})
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {currentBox.map((pokemon, i) => {
                    const isActive = activePokemon?.speciesName === pokemon.speciesName;
                    return (
                      <div
                        key={`${pokemon.speciesName ?? pokemon.key ?? "p"}-box-${activeBoxIndex}-${i}`}
                        draggable
                        onDragStart={() => setDragSource({ kind: "box", index: i })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop({ kind: "box", index: i })}
                        className={[
                          "flex flex-col items-center p-3 text-center cursor-move",
                          "border-[2px] shadow-[inset_1px_1px_0_var(--window-highlight),inset_-1px_-1px_0_var(--window-shadow)]",
                          isActive
                            ? "border-[var(--poke-blue)] bg-[rgba(56,104,176,0.06)]"
                            : "border-[var(--window-border)] bg-[var(--window-bg)]",
                        ].join(" ")}
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
              </>
            )}

            <div className="mt-3">
              <p className="font-pixel-body text-[16px] text-[var(--text-muted)]">
                Party: {partyPokemon.length}/{MAX_PARTY_SIZE} · Stored: {boxedPokemon.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </StudyShell>
  );
}
