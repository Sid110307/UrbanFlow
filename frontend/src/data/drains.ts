import type { DrainDataset, DrainFeature } from "../types";

export async function loadDrainDataset(signal?: AbortSignal): Promise<DrainDataset> {
  const response = await fetch("/data/drains.json", { signal });
  if (!response.ok) {
    throw new Error(`Could not load the mapped drain network (${response.status}).`);
  }

  const dataset = (await response.json()) as DrainDataset;
  if (dataset.type !== "FeatureCollection" || !Array.isArray(dataset.features)) {
    throw new Error("The drain dataset is not a valid feature collection.");
  }
  return dataset;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const kilometres = meters / 1000;
    return `${kilometres.toLocaleString("en-IN", {
      minimumFractionDigits: kilometres >= 100 ? 1 : 2,
      maximumFractionDigits: kilometres >= 100 ? 1 : 2,
    })} km`;
  }
  return `${Math.round(meters).toLocaleString("en-IN")} m`;
}

export function featureMatches(feature: DrainFeature, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const { properties } = feature;
  return [
    properties.id,
    properties.label,
    properties.type,
    properties.sourceId,
    properties.refName,
    properties.entity,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase().includes(normalized));
}

export function compareDrains(a: DrainFeature, b: DrainFeature): number {
  const typeOrder = { Primary: 0, Secondary: 1, Tertiary: 2 };
  const typeDifference = typeOrder[a.properties.type] - typeOrder[b.properties.type];
  if (typeDifference !== 0) return typeDifference;
  return b.properties.lengthMeters - a.properties.lengthMeters;
}
