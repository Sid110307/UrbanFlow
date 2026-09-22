import { useEffect, useMemo, useRef, useState } from "react";
import type { ObjectDetection, DetectedObject } from "@tensorflow-models/coco-ssd";
import type { SilkboardRoadSensorReading } from "../../types";

const STATUS_RANK: Record<string, number> = { dry: 0, damp: 1, pooling: 2, flooding: 3 };
const STATUS_LABEL: Record<string, string> = {
  dry: "Good condition",
  damp: "Damp surface",
  pooling: "Puddle forming",
  flooding: "Flooded",
};

let modelPromise: Promise<ObjectDetection> | null = null;

async function loadModel(): Promise<ObjectDetection> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      // Force the GPU backend explicitly: without this, tfjs can silently
      // fall back to the CPU backend, which runs detection on the main
      // thread and visibly janks the page.
      await tf.setBackend("webgl");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
  }
  return modelPromise;
}

const SCAN_INTERVAL_MS = 15000;

export function ObjectScan({
  imageSrc,
  cameraId,
  surfaceReadings,
}: {
  imageSrc: string;
  cameraId: string;
  surfaceReadings: SilkboardRoadSensorReading[];
}) {
  const [results, setResults] = useState<DetectedObject[]>([]);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function scan() {
      const img = imgRef.current;
      if (!img) return;
      if (document.hidden) {
        timer = setTimeout(scan, SCAN_INTERVAL_MS);
        return;
      }

      try {
        const model = await loadModel();
        if (cancelled) return;

        if (!img.complete) {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("image_load_failed"));
          });
        }

        const predictions = await model.detect(img);
        if (cancelled) return;
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setResults(predictions);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) timer = setTimeout(scan, SCAN_INTERVAL_MS);
      }
    }

    scan();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [imageSrc]);

  const worstStatus = useMemo(() => {
    if (surfaceReadings.length === 0) return "dry";
    return surfaceReadings.reduce(
      (worst, r) => (STATUS_RANK[r.status] > STATUS_RANK[worst] ? r.status : worst),
      "dry",
    );
  }, [surfaceReadings]);

  return (
    <div className="object-scan">
      <h4>Object Detection</h4>

      <div className="object-scan-frame">
        <img
          ref={imgRef}
          src={imageSrc}
          alt={`${cameraId} scan source`}
          className="object-scan-img"
        />
        {naturalSize &&
          results.map((detection, index) => {
            const [x, y, w, h] = detection.bbox;
            return (
              <div
                key={`${detection.class}-${index}`}
                className="object-scan-box"
                style={{
                  left: `${(x / naturalSize.width) * 100}%`,
                  top: `${(y / naturalSize.height) * 100}%`,
                  width: `${(w / naturalSize.width) * 100}%`,
                  height: `${(h / naturalSize.height) * 100}%`,
                }}
              >
                <span className="object-scan-label">
                  {detection.class} {Math.round(detection.score * 100)}%
                </span>
              </div>
            );
          })}
        {error && <div className="object-scan-error">Scan interrupted, retrying...</div>}
      </div>

      <div className={`object-scan-surface status-${worstStatus}`}>
        <span className="object-scan-surface-dot" />
        {STATUS_LABEL[worstStatus]}
      </div>
    </div>
  );
}
