import type { SilkboardFloodHistoryDataset, SilkboardRealDrainDataset } from "./types";

export async function loadSilkboardFloodHistory(
  signal?: AbortSignal,
): Promise<SilkboardFloodHistoryDataset> {
  const response = await fetch("/data/silkboard-flood-history.json", { signal });
  if (!response.ok) {
    throw new Error(`Could not load flood-history records (${response.status}).`);
  }
  return (await response.json()) as SilkboardFloodHistoryDataset;
}

export async function loadSilkboardRealDrains(
  signal?: AbortSignal,
): Promise<SilkboardRealDrainDataset> {
  const response = await fetch("/data/silkboard-real-drains.json", { signal });
  if (!response.ok) {
    throw new Error(`Could not load the real drain network (${response.status}).`);
  }
  return (await response.json()) as SilkboardRealDrainDataset;
}
