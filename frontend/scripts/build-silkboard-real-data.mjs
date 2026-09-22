import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SILKBOARD_BOUNDS = [77.6140, 12.9110, 77.6310, 12.9230];

const FLOOD_SOURCES = [
  {
    name: "BBMP low lying areas",
    datasetUrl: "https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban",
    downloadUrl:
      "https://data.opencity.in/dataset/b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c/resource/62ceac3b-f6e2-4dd1-ae9f-be80b1f2fda8/download/8e87a2fc-e014-4c6e-81f1-d5cb4db57a46.kml",
    cacheFile: "bbmp-low-lying-areas.kml",
  },
  {
    name: "Flood vulnerable locations",
    datasetUrl: "https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban",
    downloadUrl:
      "https://data.opencity.in/dataset/b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c/resource/a7d8a01f-1fbc-41e1-85f0-f15ea16b2d27/download/6b3c63b0-f461-4e9c-a2c2-006f734c5b41.kml",
    cacheFile: "flood-vulnerable-locations.kml",
  },
  {
    name: "Flood prone locations map",
    datasetUrl: "https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban",
    downloadUrl:
      "https://data.opencity.in/dataset/b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c/resource/d90fe768-caba-4c6e-b6b5-a75acd5e88a9/download/00fb1229-dcfd-4f59-813f-885e0c629add.kml",
    cacheFile: "flood-prone-locations.kml",
  },
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const dataDir = path.join(frontendDir, "public", "data");
const drainsPath = path.join(dataDir, "drains.json");
const floodOutputPath = path.join(dataDir, "silkboard-flood-history.json");
const drainsOutputPath = path.join(dataDir, "silkboard-real-drains.json");

function decodeXml(value = "") {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function inBounds([lon, lat]) {
  return (
    lon >= SILKBOARD_BOUNDS[0] &&
    lon <= SILKBOARD_BOUNDS[2] &&
    lat >= SILKBOARD_BOUNDS[1] &&
    lat <= SILKBOARD_BOUNDS[3]
  );
}

async function loadKml(source) {
  const cachePath = path.join(dataDir, source.cacheFile);
  if (existsSync(cachePath)) return readFile(cachePath, "utf8");
  const response = await fetch(source.downloadUrl);
  if (!response.ok) throw new Error(`OpenCity download failed for ${source.name}: ${response.status}`);
  return response.text();
}

function extractSimpleData(placemark) {
  const properties = {};
  const pattern = /<SimpleData\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/SimpleData>/gi;
  for (const match of placemark.matchAll(pattern)) {
    properties[decodeXml(match[1])] = decodeXml(match[2]);
  }
  return properties;
}

function parsePlacemarks(xml) {
  const placemarkPattern = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  const results = [];
  for (const match of xml.matchAll(placemarkPattern)) {
    const placemark = match[1];
    const nameMatch = placemark.match(/<name>([\s\S]*?)<\/name>/i);
    const coordMatch = placemark.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i);
    if (!coordMatch) continue;
    const [lon, lat] = decodeXml(coordMatch[1]).split(",").map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const properties = extractSimpleData(placemark);
    results.push({
      name: nameMatch ? decodeXml(nameMatch[1]) : properties.LocationName || null,
      position: [lon, lat],
      wardName: properties.WARD_NAME || null,
      wardNo: properties.WARDNO || null,
      zone: properties.ZONE || null,
    });
  }
  return results;
}

const floodFeatures = [];
for (const source of FLOOD_SOURCES) {
  const xml = await loadKml(source);
  const points = parsePlacemarks(xml).filter((p) => inBounds(p.position));
  for (const point of points) {
    floodFeatures.push({
      id: `SKB-FLOOD-${String(floodFeatures.length + 1).padStart(2, "0")}`,
      name: point.name || "Unnamed location",
      position: point.position,
      wardName: point.wardName,
      wardNo: point.wardNo,
      zone: point.zone,
      source: source.name,
    });
  }
}

const floodDataset = {
  metadata: {
    title: "BBMP / OpenCity flood-vulnerability records near Silk Board Junction",
    sourceName: "OpenCity / BBMP",
    sourceUrl: FLOOD_SOURCES[0].datasetUrl,
    dataUpdated: new Date().toISOString().slice(0, 10),
    totalFeatures: floodFeatures.length,
    bounds: SILKBOARD_BOUNDS,
  },
  features: floodFeatures,
};

await mkdir(dataDir, { recursive: true });
await writeFile(floodOutputPath, JSON.stringify(floodDataset, null, 2));

if (!existsSync(drainsPath)) {
  throw new Error(
    `${drainsPath} not found. Run "pnpm build:data" first to generate the city-wide drain dataset.`,
  );
}
const cityDrains = JSON.parse(await readFile(drainsPath, "utf8"));

function featureInBounds(feature) {
  const geom = feature.geometry;
  const lines = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
  return lines.some((line) => line.some(inBounds));
}

const silkboardDrainFeatures = cityDrains.features.filter(featureInBounds);

const drainsDataset = {
  type: "FeatureCollection",
  metadata: {
    title: "Real stormwater drain segments near Silk Board Junction",
    sourceName: cityDrains.metadata.sourceName,
    sourceUrl: cityDrains.metadata.sourceUrl,
    dataUpdated: cityDrains.metadata.dataUpdated,
    totalFeatures: silkboardDrainFeatures.length,
    bounds: SILKBOARD_BOUNDS,
  },
  features: silkboardDrainFeatures,
};

await writeFile(drainsOutputPath, JSON.stringify(drainsDataset));

console.log(
  JSON.stringify(
    {
      floodHistoryOutput: floodOutputPath,
      floodFeatures: floodFeatures.length,
      realDrainsOutput: drainsOutputPath,
      realDrainFeatures: silkboardDrainFeatures.length,
    },
    null,
    2,
  ),
);
