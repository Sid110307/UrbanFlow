import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://data.opencity.in/dataset/fc97e05c-c54b-44e9-8d98-7663ee887922/resource/801779e6-ed81-457d-bd2a-7e3cc95ad1ee/download/e42be0cb-1bf4-4a7b-9c78-0c0dbdae3237.kml";
const DATASET_URL =
  "https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const inputPath = path.join(
  frontendDir,
  "public",
  "data",
  "bengaluru-stormwater-drains.kml",
);
const outputPath = path.join(frontendDir, "public", "data", "drains.json");

const typeConfig = {
  Primary: { prefix: "PRI", tolerance: 0.000018 },
  Secondary: { prefix: "SEC", tolerance: 0.000028 },
  Tertiary: { prefix: "TER", tolerance: 0.00004 },
};

function decodeXml(value = "") {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function radialSimplify(points, squaredTolerance) {
  let previous = points[0];
  const simplified = [previous];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (squaredDistance(point, previous) > squaredTolerance) {
      simplified.push(point);
      previous = point;
    }
  }

  if (previous !== points.at(-1)) simplified.push(points.at(-1));
  return simplified;
}

function douglasPeuckerStep(points, first, last, squaredTolerance, simplified) {
  let maxDistance = squaredTolerance;
  let splitIndex = 0;

  for (let index = first + 1; index < last; index += 1) {
    const distance = squaredSegmentDistance(points[index], points[first], points[last]);
    if (distance > maxDistance) {
      splitIndex = index;
      maxDistance = distance;
    }
  }

  if (maxDistance > squaredTolerance) {
    if (splitIndex - first > 1) {
      douglasPeuckerStep(points, first, splitIndex, squaredTolerance, simplified);
    }
    simplified.push(points[splitIndex]);
    if (last - splitIndex > 1) {
      douglasPeuckerStep(points, splitIndex, last, squaredTolerance, simplified);
    }
  }
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const squaredTolerance = tolerance * tolerance;
  const radial = radialSimplify(points, squaredTolerance);
  if (radial.length <= 2) return radial;

  const result = [radial[0]];
  douglasPeuckerStep(radial, 0, radial.length - 1, squaredTolerance, result);
  result.push(radial.at(-1));
  return result;
}

function roundCoordinate(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseCoordinates(raw) {
  return decodeXml(raw)
    .split(/\s+/)
    .map((token) => token.split(","))
    .filter((parts) => parts.length >= 2)
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function extractProperties(placemark) {
  const properties = {};
  const pattern = /<SimpleData\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/SimpleData>/gi;
  for (const match of placemark.matchAll(pattern)) {
    properties[decodeXml(match[1])] = decodeXml(match[2]);
  }
  return properties;
}

function measuredLength(properties) {
  const candidates = [
    properties["Shape.STLength()"],
    properties.Shape_STLength__,
    properties.SHAPE_Leng,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const lengthInKilometres = Number(properties.Length);
  return Number.isFinite(lengthInKilometres) ? lengthInKilometres * 1000 : 0;
}

function emptyCategory() {
  return { count: 0, lengthMeters: 0, originalVertices: 0, displayVertices: 0 };
}

async function loadKml() {
  if (existsSync(inputPath)) return readFile(inputPath, "utf8");
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`OpenCity download failed: ${response.status}`);
  return response.text();
}

const xml = await loadKml();
const features = [];
const counters = { Primary: 0, Secondary: 0, Tertiary: 0 };
const categories = {
  Primary: emptyCategory(),
  Secondary: emptyCategory(),
  Tertiary: emptyCategory(),
};
const bounds = [Infinity, Infinity, -Infinity, -Infinity];
const placemarkPattern = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;

for (const placemarkMatch of xml.matchAll(placemarkPattern)) {
  const placemark = placemarkMatch[1];
  const source = extractProperties(placemark);
  const type = decodeXml(source.Type);
  const config = typeConfig[type];
  if (!config) continue;

  const originalLines = [];
  const linePattern = /<LineString\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi;
  for (const coordinateMatch of placemark.matchAll(linePattern)) {
    const coordinates = parseCoordinates(coordinateMatch[1]);
    if (coordinates.length >= 2) originalLines.push(coordinates);
  }
  if (originalLines.length === 0) continue;

  counters[type] += 1;
  const displayLines = originalLines.map((line) =>
    simplify(line, config.tolerance).map(([lon, lat]) => [
      roundCoordinate(lon),
      roundCoordinate(lat),
    ]),
  );
  const featureBounds = [Infinity, Infinity, -Infinity, -Infinity];
  let originalVertices = 0;
  let displayVertices = 0;

  for (const line of originalLines) {
    originalVertices += line.length;
    for (const [lon, lat] of line) {
      featureBounds[0] = Math.min(featureBounds[0], lon);
      featureBounds[1] = Math.min(featureBounds[1], lat);
      featureBounds[2] = Math.max(featureBounds[2], lon);
      featureBounds[3] = Math.max(featureBounds[3], lat);
      bounds[0] = Math.min(bounds[0], lon);
      bounds[1] = Math.min(bounds[1], lat);
      bounds[2] = Math.max(bounds[2], lon);
      bounds[3] = Math.max(bounds[3], lat);
    }
  }
  for (const line of displayLines) displayVertices += line.length;

  const index = counters[type];
  const id = `${config.prefix}-${String(index).padStart(4, "0")}`;
  const lengthMeters = measuredLength(source);
  const sourceId = source.OBJECTID_1 || source.OBJECTID || source.FID_ || String(index);
  const refName = decodeXml(source.RefName);
  const entity = decodeXml(source.Bengaluru_GIS_DBO_SWD_Tertiary_Entity);

  categories[type].count += 1;
  categories[type].lengthMeters += lengthMeters;
  categories[type].originalVertices += originalVertices;
  categories[type].displayVertices += displayVertices;

  features.push({
    type: "Feature",
    geometry:
      displayLines.length === 1
        ? { type: "LineString", coordinates: displayLines[0] }
        : { type: "MultiLineString", coordinates: displayLines },
    properties: {
      id,
      label: `${type} drain ${String(index).padStart(4, "0")}`,
      type,
      lengthMeters: Math.round(lengthMeters * 10) / 10,
      sourceId,
      ...(refName ? { refName } : {}),
      ...(entity ? { entity } : {}),
      originalVertices,
      displayVertices,
      bounds: featureBounds.map(roundCoordinate),
      center: [
        roundCoordinate((featureBounds[0] + featureBounds[2]) / 2),
        roundCoordinate((featureBounds[1] + featureBounds[3]) / 2),
      ],
    },
  });
}

const totalLengthMeters = Object.values(categories).reduce(
  (sum, category) => sum + category.lengthMeters,
  0,
);
const totalOriginalVertices = Object.values(categories).reduce(
  (sum, category) => sum + category.originalVertices,
  0,
);
const totalDisplayVertices = Object.values(categories).reduce(
  (sum, category) => sum + category.displayVertices,
  0,
);

const dataset = {
  type: "FeatureCollection",
  metadata: {
    title: "Bengaluru stormwater drain network",
    sourceName: "OpenCity / BBMP",
    sourceUrl: DATASET_URL,
    downloadUrl: SOURCE_URL,
    dataUpdated: "2025-11-25",
    totalFeatures: features.length,
    totalLengthMeters: Math.round(totalLengthMeters * 10) / 10,
    originalVertices: totalOriginalVertices,
    displayVertices: totalDisplayVertices,
    bounds: bounds.map(roundCoordinate),
    categories,
  },
  features,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(dataset));

console.log(
  JSON.stringify(
    {
      output: outputPath,
      features: features.length,
      totalLengthKm: Math.round(totalLengthMeters / 100) / 10,
      originalVertices: totalOriginalVertices,
      displayVertices: totalDisplayVertices,
      reductionPercent:
        Math.round((1 - totalDisplayVertices / totalOriginalVertices) * 1000) / 10,
    },
    null,
    2,
  ),
);
