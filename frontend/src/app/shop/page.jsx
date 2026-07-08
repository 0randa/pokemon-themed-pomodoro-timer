"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { loadGuestData, saveGuestData } from "@/lib/guest-storage";
import {
  loadUserProgress,
  saveUserProgress,
  loadInventory,
  saveInventoryItem,
} from "@/lib/user-progress";
import { SHOP_ITEMS } from "@/lib/shop";
import StudyShell from "@/components/study-shell";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

/** Pixel-art window box classes reused across panels. */
const WIN =
  "bg-[var(--window-bg)] border-[3px] border-[var(--window-border)] " +
  "shadow-[inset_2px_2px_0_var(--window-highlight),inset_-2px_-2px_0_var(--window-shadow)]";

/** Category → triangle indicator color. */
const CAT_COLOR = {
  stone: "var(--poke-red)",
  trade: "var(--poke-blue)",
  happiness: "var(--poke-green)",
};

export default function ShopPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pokedollars, setPokedollars] = useState(0);
  const [inventory, setInventory] = useState([]);
  const [totalXp, setTotalXp] = useState(0);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);
  const [activePokemon, setActivePokemon] = useState(null);
  const [regionId, setRegionId] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [buying, setBuying] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef(null);

  /* ── Load data ───────────────────────────────────────────────── */
  useEffect(() => {
    if (loading) return;
    if (user) {
      Promise.all([loadUserProgress(), loadInventory(user.id)]).then(
        ([progress, inv]) => {
          setPokedollars(progress.pokedollars ?? 0);
          setTotalXp(progress.totalXp ?? 0);
          setPomodorosCompleted(progress.pomodorosCompleted ?? 0);
          setActivePokemon(progress.activePokemon);
          setRegionId(progress.regionId);
          setInventory(inv ?? []);
          setDataLoaded(true);
        },
      );
    } else {
      const saved = loadGuestData();
      setPokedollars(saved?.pokedollars ?? 0);
      setTotalXp(saved?.totalXp ?? 0);
      setPomodorosCompleted(saved?.pomodorosCompleted ?? 0);
      setActivePokemon(saved?.activePokemon ?? null);
      setRegionId(saved?.regionId ?? null);
      setInventory(saved?.inventory ?? []);
      setDataLoaded(true);
    }
  }, [user, loading]);

  /* ── Helpers ─────────────────────────────────────────────────── */
  const getOwned = (id) =>
    inventory.find((i) => i.itemId === id)?.quantity ?? 0;

  const selectedItem =
    selectedIndex < SHOP_ITEMS.length ? SHOP_ITEMS[selectedIndex] : null;
  const ownedQty = selectedItem ? getOwned(selectedItem.id) : 0;
  const canAfford = selectedItem ? pokedollars >= selectedItem.price : false;

  /* ── Buy handler ─────────────────────────────────────────────── */
  const handleBuy = async (item) => {
    if (pokedollars < item.price) return;
    setBuying(item.id);

    const newBal = pokedollars - item.price;
    setPokedollars(newBal);

    const existing = inventory.find((i) => i.itemId === item.id);
    const newQty = (existing?.quantity ?? 0) + 1;
    const newInv = existing
      ? inventory.map((i) =>
          i.itemId === item.id ? { ...i, quantity: newQty } : i,
        )
      : [...inventory, { itemId: item.id, quantity: 1 }];
    setInventory(newInv);

    if (user) {
      await Promise.all([
        saveUserProgress({
          userId: user.id,
          activePokemon,
          totalXp,
          pomodorosCompleted,
          pokedollars: newBal,
          regionId,
        }),
        saveInventoryItem(item.id, newQty, user.id),
      ]);
    } else {
      const saved = loadGuestData() ?? {};
      saveGuestData({ ...saved, pokedollars: newBal, inventory: newInv });
    }

    setBuying(null);
  };

  /* ── Keyboard navigation ─────────────────────────────────────── */
  const stateRef = useRef({});
  stateRef.current = { selectedIndex, canAfford, buying, handleBuy };

  useEffect(() => {
    if (!dataLoaded) return;

    const onKey = (e) => {
      const {
        selectedIndex: idx,
        canAfford: afford,
        buying: busy,
        handleBuy: buy,
      } = stateRef.current;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, SHOP_ITEMS.length));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (idx >= SHOP_ITEMS.length) router.push("/");
          else if (afford && !busy) buy(SHOP_ITEMS[idx]);
          break;
        case "Escape":
          e.preventDefault();
          router.push("/");
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dataLoaded, router]);

  /* ── Scroll selected row into view ───────────────────────────── */
  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll("[data-row]");
    rows[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  /* ── Loading state ───────────────────────────────────────────── */
  if (loading || !dataLoaded) {
    return (
      <StudyShell>
        <div className="max-w-xl mx-auto">
          <div className={`${WIN} p-4`}>
            <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">
              Loading…
            </p>
          </div>
        </div>
      </StudyShell>
    );
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <StudyShell>
      <div className="max-w-xl mx-auto space-y-3">
        {/* ── Top section: Money/Bag + Item list ────────────── */}
        <div className="flex gap-3 items-stretch">
          {/* Left column — Money + In Bag */}
          <div className="flex flex-col justify-between shrink-0 gap-3 w-[120px]">
            {/* Money box */}
            <div className={`${WIN} p-3`}>
              <div className="font-pixel text-[8px] tracking-wider text-[var(--text-muted)] mb-1.5">
                Money:
              </div>
              <div className="font-pixel text-[11px] tracking-wide text-[var(--text-dark)]">
                ₽{pokedollars.toLocaleString()}
              </div>
            </div>

            {/* Item sprite preview */}
            <div className={`${WIN} p-2 flex items-center justify-center`}>
              {selectedItem ? (
                <img
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${selectedItem.id}.png`}
                  alt={selectedItem.label}
                  className="w-16 h-16"
                  draggable={false}
                />
              ) : (
                <div className="w-16 h-16" />
              )}
            </div>

            {/* In Bag box */}
            <div className={`${WIN} p-3`}>
              <div className="font-pixel text-[8px] tracking-wider text-[var(--text-muted)] mb-1.5">
                In Bag:
              </div>
              <div className="font-pixel text-[14px] tracking-wide text-[var(--text-dark)] text-center">
                {ownedQty}
              </div>
            </div>
          </div>

          {/* Right column — Item list */}
          <div
            ref={listRef}
            className={`${WIN} flex-1 py-1 overflow-y-auto`}
            style={{ maxHeight: 340 }}
            role="listbox"
            aria-label="Shop items"
          >
            {SHOP_ITEMS.map((item, i) => {
              const sel = selectedIndex === i;

              return (
                <button
                  key={item.id}
                  data-row
                  role="option"
                  aria-selected={sel}
                  className={[
                    "w-full flex items-center gap-1.5 px-3 py-[6px]",
                    "cursor-pointer border-2 transition-none whitespace-nowrap",
                    sel
                      ? "border-[var(--poke-red)]"
                      : "border-transparent",
                  ].join(" ")}
                  onClick={() => setSelectedIndex(i)}
                >
                  {/* Category triangle indicator */}
                  <span
                    className="w-[7px] h-[7px] shrink-0"
                    style={{
                      backgroundColor: CAT_COLOR[item.category],
                      clipPath: "polygon(0% 0%, 100% 50%, 0% 100%)",
                    }}
                    aria-hidden="true"
                  />

                  {/* Item name */}
                  <span className="font-pixel text-[9px] tracking-wide text-[var(--text-dark)] flex-1 text-left">
                    {item.label}
                  </span>

                  {/* Price */}
                  <span className="font-pixel text-[9px] tracking-wide text-[var(--text-dark)] shrink-0 tabular-nums min-w-[50px] text-right">
                    ₽ {item.price.toLocaleString()}
                  </span>
                </button>
              );
            })}

            {/* Cancel row */}
            <button
              data-row
              role="option"
              aria-selected={selectedIndex === SHOP_ITEMS.length}
              className={[
                "w-full flex items-center gap-1.5 px-3 py-[6px]",
                "cursor-pointer border-2 transition-none",
                selectedIndex === SHOP_ITEMS.length
                  ? "border-[var(--poke-red)]"
                  : "border-transparent",
              ].join(" ")}
              onClick={() => {
                setSelectedIndex(SHOP_ITEMS.length);
                router.push("/");
              }}
            >
              <span className="w-[7px] shrink-0" aria-hidden="true" />
              <span className="font-pixel text-[9px] tracking-wide text-[var(--text-dark)] text-left">
                Cancel
              </span>
            </button>
          </div>
        </div>

        {/* ── Description panel ─────────────────────────────── */}
        <div className={`${WIN} p-4 min-h-[72px]`}>
          {selectedItem ? (
            <div className="flex items-end gap-4">
              <p className="font-pixel-body text-[20px] leading-snug text-[var(--text-dark)] flex-1">
                {selectedItem.description}
              </p>
              <Button
                variant="primary"
                size="sm"
                disabled={!canAfford || buying === selectedItem.id}
                onClick={() => handleBuy(selectedItem)}
              >
                {buying === selectedItem.id ? "…" : "Buy"}
              </Button>
            </div>
          ) : (
            <p className="font-pixel-body text-[20px] text-[var(--text-muted)]">
              Come again!
            </p>
          )}
        </div>

        {/* ── Empty-state hint ──────────────────────────────── */}
        {pokedollars === 0 && inventory.length === 0 && (
          <p className="font-pixel-body text-[18px] text-[var(--text-muted)] text-center">
            Complete pomodoros to earn ₽100 each!
          </p>
        )}
      </div>
    </StudyShell>
  );
}
