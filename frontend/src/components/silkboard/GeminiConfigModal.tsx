import { useState, useEffect } from "react";
import {
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
  testGeminiApiKey,
  listGeminiModels,
  POPULAR_GEMINI_MODELS,
  GeminiModelInfo,
} from "../../services/geminiService";

export function GeminiConfigModal({
  onClose,
  onConfigSaved,
}: {
  onClose: () => void;
  onConfigSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-1.5-flash-latest");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<GeminiModelInfo[]>([]);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const existingKey = getGeminiApiKey();
    if (existingKey) {
      setApiKey(existingKey);
      listGeminiModels(existingKey).then((models) => {
        if (models.length > 0) setDiscoveredModels(models);
      });
    }
    const currentModel = getGeminiModel();
    if (currentModel === "gemini-1.5-flash") {
      // Default to latest if previously on raw flash
      setModel("gemini-1.5-flash-latest");
    } else {
      setModel(currentModel);
    }
  }, []);

  const handleFetchModels = async () => {
    if (!apiKey.trim()) return;
    setFetchingModels(true);
    try {
      const models = await listGeminiModels(apiKey.trim());
      setDiscoveredModels(models);
      if (models.length > 0) {
        const hasCurrent = models.some((m) => m.id === model);
        if (!hasCurrent) {
          const flashModel = models.find((m) => m.id.includes("flash")) || models[0];
          setModel(flashModel.id);
        }
      }
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: "Please enter an API key first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const res = await testGeminiApiKey(apiKey.trim(), model);
    setTesting(false);
    setTestResult(res);

    if (res.availableModels && res.availableModels.length > 0) {
      setDiscoveredModels(res.availableModels);
    }
    if (res.success && res.model) {
      setModel(res.model);
    }
  };

  const handleSave = () => {
    setGeminiApiKey(apiKey.trim());
    setGeminiModel(model);
    onConfigSaved();
    onClose();
  };

  const handleClear = () => {
    setGeminiApiKey("");
    setApiKey("");
    setTestResult(null);
    setDiscoveredModels([]);
    onConfigSaved();
  };

  return (
    <div className="gemini-modal-backdrop" onClick={onClose}>
      <div className="gemini-modal" onClick={(e) => e.stopPropagation()}>
        <header className="gemini-modal-header">
          <div className="gemini-title-group">
            <div>
              <h3>Gemini Agent Core Settings</h3>
              <p>Layer 3 Causal Disambiguation Engine (§5.2 Schema)</p>
            </div>
          </div>
          <button type="button" className="gemini-modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="gemini-modal-body">
          <div className="gemini-info-box">
            <strong>Live LLM Reasoning for IoT Telemetry</strong>
            <p>
              When active, anomalous sensor events at Silk Board are sent to Google Gemini Flash.
              Gemini evaluates the 4-signal telemetry vector (flow velocity drop vs. water level spike vs. rainfall vs. neighbor graph)
              to determine whether a flood is caused by natural rain runoff or a physical debris blockage.
            </p>
          </div>

          <div className="gemini-form-group">
            <label htmlFor="gemini-key-input">
              Google Gemini API Key:
            </label>
            <div className="gemini-input-wrapper">
              <input
                id="gemini-key-input"
                type={showKey ? "text" : "password"}
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={() => {
                  if (apiKey.trim() && discoveredModels.length === 0) {
                    handleFetchModels();
                  }
                }}
              />
              <button
                type="button"
                className="gemini-toggle-vis"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <small className="gemini-input-hint">
              Stored locally in your browser. Optional: without a personal key, requests route through UrbanFlow's own Gemini access, falling back to the deterministic 4-signal heuristic model if that is unavailable.
            </small>
          </div>

          <div className="gemini-form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label htmlFor="gemini-model-select" style={{ margin: 0 }}>Reasoning Model:</label>
              {apiKey.trim() && (
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={fetchingModels}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#38bdf8",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  {fetchingModels ? "Scanning models..." : "Scan Available Models"}
                </button>
              )}
            </div>

            <select
              id="gemini-model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="gemini-select"
            >
              {discoveredModels.length > 0 ? (
                <optgroup label="Models Enabled for Your Key">
                  {discoveredModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.id})
                    </option>
                  ))}
                </optgroup>
              ) : null}

              <optgroup label="Standard Models">
                {POPULAR_GEMINI_MODELS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {testResult && (
            <div
              className={`gemini-test-feedback ${
                testResult.success ? "is-success" : "is-error"
              }`}
            >
              {testResult.message}
            </div>
          )}
        </div>

        <footer className="gemini-modal-footer">
          <div className="footer-left">
            {apiKey && (
              <button
                type="button"
                className="btn-gemini-clear"
                onClick={handleClear}
              >
                Clear Key (Use Mock)
              </button>
            )}
          </div>
          <div className="footer-right">
            <button
              type="button"
              className="btn-gemini-test"
              disabled={testing || !apiKey.trim()}
              onClick={handleTest}
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
            <button
              type="button"
              className="btn-gemini-save"
              onClick={handleSave}
            >
              Save & Activate
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
