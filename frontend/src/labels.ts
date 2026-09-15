import type { RiskLevel } from "./types";

export const RISK_LABEL: Record<RiskLevel, string> = {
  green: "NOMINAL",
  yellow: "ADVISORY",
  red: "CRITICAL",
};

export const RISK_ORDER: RiskLevel[] = ["red", "yellow", "green"];
