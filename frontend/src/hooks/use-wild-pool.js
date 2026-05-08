import { WILD_ENCOUNTERS } from "@/data/wild-encounters";

export function useWildPool(regionId) {
  const wildPool = regionId ? (WILD_ENCOUNTERS[regionId] ?? null) : null;
  return { wildPool, loading: false };
}
