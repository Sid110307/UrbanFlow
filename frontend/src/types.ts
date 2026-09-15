export type RiskLevel = "green" | "yellow" | "red";

export interface Telemetry {
  timestamp: string;
  water_level_cm: number;
  flow_velocity_mps: number;
  turbidity_ntu: number;
  precip_rate_mm_hr: number;
  upstream_precip_mm_hr: number;
}

export interface Drain {
  drain_id: string;
  name: string;
  lat: number;
  lon: number;
  status: RiskLevel;
  updated_at: string;
}

export interface DrainDetail extends Drain {
  latest_reading: Telemetry | null;
  history: Telemetry[];
  neighbors: string[];
}

export interface Incident {
  id: number;
  drain_id: string;
  timestamp: string;
  classification: string;
  blockage_probability: number;
  reasoning: string;
  trigger_visual_triage: boolean;
  debris_class: string | null;
  debris_confidence: number | null;
  debris_rationale: string | null;
  camera_image_path: string | null;
  graph_narrative: string | null;
  risk_level: RiskLevel;
  dispatch_text: string | null;
  alert_text: string | null;
}

export interface TelemetryEvent {
  type: "telemetry";
  drain_id: string;
  reading: Telemetry;
  status: RiskLevel;
}

export interface IncidentEvent {
  type: "incident";
  drain_id: string;
  reading: Telemetry;
  status: RiskLevel;
  incident: Omit<Incident, "id" | "drain_id"> & { timestamp: string };
}

export type LiveEvent = TelemetryEvent | IncidentEvent;
