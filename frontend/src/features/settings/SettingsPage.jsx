import { useEffect, useMemo, useRef, useState } from "react";

const SETTINGS_SECTIONS = [
  { id: "scanning", label: "Scanning", icon: "R" },
  { id: "strategy", label: "Strategy", icon: "T" },
  { id: "automation", label: "Automation", icon: "A" },
  { id: "risk", label: "Risk & Safety", icon: "S" },
  { id: "markets", label: "Universe", icon: "G" },
  { id: "engine", label: "Engine", icon: "P" },
  { id: "universes", label: "Stock Universes", icon: "L" },
];

function formatExecutionMode(mode, labels) {
  return labels?.[mode] || String(mode || "Manual").replaceAll("_", " ");
}

function formatUniverseMode(mode) {
  return String(mode || "S_AND_P_500").replaceAll("_", " ");
}

function formatPrimaryMarket(value) {
  if (value === "SG") return "Singapore";
  if (value === "BOTH") return "US + Singapore";
  return "US";
}

function SectionHeader({ accent, description, eyebrow, icon, title }) {
  return (
    <div className="st-shead">
      <div className={`st-shead-ico${accent ? ` ${accent}` : ""}`}>
        <span>{icon}</span>
      </div>
      <div>
        <span className="st-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

function SettingsField({ children, hint, label, wide = false }) {
  return (
    <label className={`st-field${wide ? " wide" : ""}`}>
      <span className="st-flabel">
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

function SettingsSelect({ onChange, options, value }) {
  return (
    <select className="st-input" onChange={(event) => onChange(event.target.value)} value={value}>
      {options.map((option) => {
        const normalized =
          typeof option === "object"
            ? option
            : {
                value: option,
                label: option,
              };
        return (
          <option key={normalized.value} value={normalized.value}>
            {normalized.label}
          </option>
        );
      })}
    </select>
  );
}

function SwitchRow({ caution, checked, description, label, onChange }) {
  return (
    <div className="st-switch-row">
      <div className="st-switch-copy">
        <strong>
          {label}
          {caution ? <em className="st-caution">{caution}</em> : null}
        </strong>
        {description ? <span>{description}</span> : null}
      </div>
      <label className="st-toggle">
        <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span />
      </label>
    </div>
  );
}

function InfoCard({ label, note, value }) {
  return (
    <div className="st-info">
      <span className="st-eyebrow">{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function StockUniverseSummary({
  handleDeleteStockUniverse,
  selectedStockUniverse,
  setSelectedStockUniverseId,
  stockUniverses,
}) {
  if (stockUniverses.length === 0) {
    return (
      <div className="st-empty">
        <span className="st-empty-glyph">L</span>
        <p>No stock universes saved yet. Create one above to reuse it across the cockpit.</p>
      </div>
    );
  }

  return (
    <div className="st-universe-list">
      {stockUniverses.map((universe) => (
        <div
          className={`st-universe-row${selectedStockUniverse?.id === universe.id ? " active" : ""}`}
          key={universe.id}
        >
          <button
            className="st-universe-row-main"
            onClick={() => setSelectedStockUniverseId(universe.id)}
            type="button"
          >
            <div>
              <strong>{universe.name}</strong>
              <span>{String(universe.universeType || "MANUAL").replaceAll("_", " ")}</span>
            </div>
            <span>{(universe.members || []).length} symbols</span>
          </button>
          <button
            className="st-inline-danger"
            onClick={(event) => {
              event.stopPropagation();
              handleDeleteStockUniverse(universe.id);
            }}
            type="button"
          >
            <span>-</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function StockUniverseMembers({
  handleAddStockUniverseMembers,
  handleRemoveStockUniverseMember,
  selectedStockUniverse,
  setStockUniverseMemberInput,
  stockUniverseMemberInput,
}) {
  if (!selectedStockUniverse) {
    return (
      <div className="st-empty">
        <span className="st-empty-glyph">D</span>
        <p>Select a group to see its symbols, or add symbols to one.</p>
      </div>
    );
  }

  return (
    <div className="st-universe-members">
      <div className="st-universe-members-form">
        <SettingsField label="Add symbols to selected" wide>
          <input
            className="st-input"
            onChange={(event) => setStockUniverseMemberInput(event.target.value.toUpperCase())}
            placeholder="AMZN, GOOGL"
            value={stockUniverseMemberInput}
          />
        </SettingsField>
        <button className="st-btn primary" onClick={handleAddStockUniverseMembers} type="button">
          <span>+</span> Add Symbols
        </button>
      </div>

      <div className="st-member-pills">
        {(selectedStockUniverse.members || []).length > 0 ? (
          selectedStockUniverse.members.map((member) => (
            <div className="st-member-pill" key={member.symbol}>
              <span>{member.symbol}</span>
              <button
                onClick={() => handleRemoveStockUniverseMember(selectedStockUniverse.id, member.symbol)}
                type="button"
              >
                <span>-</span>
              </button>
            </div>
          ))
        ) : (
          <p className="st-empty-inline">No symbols yet in this universe.</p>
        )}
      </div>
    </div>
  );
}

export default function SettingsFeaturePage({
  adminMode,
  setAdminMode,
  setScanLimit,
  scanLimit,
  setRiskMultiplier,
  riskMultiplier,
  handleTradingHorizonChange,
  tradingHorizon,
  TRADING_HORIZONS,
  HORIZON_SETTINGS,
  engineIsRunning,
  setEngineInterval,
  engineInterval,
  ENGINE_INTERVALS,
  setSignalThreshold,
  signalThreshold,
  activeHorizonLabel,
  activeHorizonProfile,
  setExecutionMode,
  executionMode,
  EXECUTION_MODES,
  setAutoExecuteConfidenceThreshold,
  autoExecuteConfidenceThreshold,
  setMaxTradeSizeForAutoExecution,
  maxTradeSizeForAutoExecution,
  allowTradingNearEarnings,
  setAllowTradingNearEarnings,
  allowOvernightPositions,
  setAllowOvernightPositions,
  pauseAutomationDuringMajorMacroEvents,
  setPauseAutomationDuringMajorMacroEvents,
  setScoreThreshold,
  scoreThreshold,
  setAlertThreshold,
  alertThreshold,
  setDrawdownThreshold,
  drawdownThreshold,
  setDailyLossLimit,
  dailyLossLimit,
  setWeeklyLossLimit,
  weeklyLossLimit,
  marketHoursOnly,
  setMarketHoursOnly,
  isAutoRefreshEnabled,
  setIsAutoRefreshEnabled,
  scanWatchlistOnly,
  setScanWatchlistOnly,
  universeMode,
  highRiskMode,
  primaryMarket,
  includeSgx,
  setPrimaryMarket,
  setIncludeSgx,
  setExchangeFilter,
  setCurrencyDisplay,
  exchangeFilter,
  EXCHANGE_FILTERS,
  currencyDisplay,
  setUniverseMode,
  setHighRiskMode,
  setMinMarketCap,
  minMarketCap,
  setMaxMarketCap,
  maxMarketCap,
  setMinAverageVolume,
  minAverageVolume,
  excludePennyStocks,
  setExcludePennyStocks,
  includeNonSp500,
  setIncludeNonSp500,
  isEngineChanging,
  handleStartEngine,
  handleStopEngine,
  handleSaveSafetySettings,
  formatSafetyPercent,
  safetyStatus,
  safetyError,
  stockUniverses,
  stockUniversesError,
  setStockUniverseForm,
  stockUniverseForm,
  handleCreateStockUniverse,
  selectedStockUniverseId,
  handleUpdateStockUniverse,
  handleCreateUniverseFromSource,
  handleCreateUniverseFromSector,
  availableSectors,
  availableIndustries,
  selectedStockUniverse,
  setStockUniverseMemberInput,
  stockUniverseMemberInput,
  handleAddStockUniverseMembers,
  setSelectedStockUniverseId,
  handleDeleteStockUniverse,
  handleRemoveStockUniverseMember,
}) {
  const [activeSection, setActiveSection] = useState("scanning");
  const sectionRefs = useRef({});

  useEffect(() => {
    const onScroll = () => {
      let current = SETTINGS_SECTIONS[0].id;
      for (const section of SETTINGS_SECTIONS) {
        const node = sectionRefs.current[section.id];
        if (node && node.getBoundingClientRect().top <= 140) {
          current = section.id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jumpToSection = (sectionId) => {
    setActiveSection(sectionId);
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const horizonOptions = TRADING_HORIZONS.map((horizon) => ({
    value: horizon,
    label: HORIZON_SETTINGS[horizon].label,
  }));
  const executionModeOptions = useMemo(
    () =>
      Object.entries(EXECUTION_MODES).map(([value, label]) => ({
        value,
        label,
      })),
    [EXECUTION_MODES]
  );
  const universeModeOptions = [
    { value: "S_AND_P_500", label: "S&P 500" },
    { value: "LARGE_CAP", label: "Large Cap" },
    { value: "MID_CAP", label: "Mid Cap" },
    { value: "SMALL_CAP", label: "Small Cap" },
    { value: "HIGH_GROWTH_HIGH_RISK", label: "High Growth / High Risk" },
    { value: "CUSTOM", label: "Custom" },
  ];

  return (
    <section className="alerts-panel settings-panel st-app-shell">
      <div className="st-head">
        <div>
          <p className="eyebrow">Trading Cockpit</p>
          <h2 className="st-title">Settings</h2>
          <p className="st-sub">Runtime controls, engine preferences, and reusable universe configuration.</p>
        </div>
        <div className="st-head-meta">
          <span className="st-head-note">Settings persist locally and drive scans, automation, and safety.</span>
        </div>
      </div>

      <section className="st-admin-card">
        <div className="st-admin-ico">
          <span>≡</span>
        </div>
        <div className="st-admin-copy">
          <strong>Admin mode</strong>
          <span>
            Show advanced system controls, engine diagnostics, and the Playbook / Validation / Broker tabs.
          </span>
        </div>
        <label className="st-toggle">
          <input checked={adminMode} onChange={(event) => setAdminMode(event.target.checked)} type="checkbox" />
          <span />
        </label>
      </section>

      <div className="st-layout">
        <nav className="st-secnav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((section) => {
            return (
              <button
                className={`st-secnav-item${activeSection === section.id ? " active" : ""}`}
                key={section.id}
                onClick={() => jumpToSection(section.id)}
                type="button"
              >
                <span className="st-secnav-glyph">{section.icon}</span>
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="st-content">
          <section className="st-section" ref={(node) => (sectionRefs.current.scanning = node)}>
            <SectionHeader
              description="What the scanner pulls and how fresh it stays."
              eyebrow="Engine input"
              icon="R"
              title="Scanning"
            />
            <div className="st-fields">
              <SettingsField label="Number of stocks">
                <input
                  className="st-input"
                  min="1"
                  max="500"
                  onChange={(event) => setScanLimit(event.target.value)}
                  type="number"
                  value={scanLimit}
                />
              </SettingsField>
              <SettingsField label="Scan interval">
                <SettingsSelect
                  onChange={setEngineInterval}
                  options={ENGINE_INTERVALS.map((interval) => ({ value: interval, label: interval }))}
                  value={engineInterval}
                />
              </SettingsField>
              <SettingsField hint="0–100" label="Score threshold">
                <input
                  className="st-input"
                  min="0"
                  max="100"
                  onChange={(event) => setScoreThreshold(event.target.value)}
                  type="number"
                  value={scoreThreshold}
                />
              </SettingsField>
              <SettingsField hint="0–100" label="Alert threshold">
                <input
                  className="st-input"
                  min="0"
                  max="100"
                  onChange={(event) => setAlertThreshold(event.target.value)}
                  type="number"
                  value={alertThreshold}
                />
              </SettingsField>
            </div>
            <div className="st-switches">
              <SwitchRow
                checked={isAutoRefreshEnabled}
                description="Re-pull scan results on a timer."
                label="Auto-refresh scanner data"
                onChange={setIsAutoRefreshEnabled}
              />
              <SwitchRow
                checked={scanWatchlistOnly}
                description="Restrict scans to your saved symbols."
                label="Scan watchlist only"
                onChange={setScanWatchlistOnly}
              />
              <SwitchRow
                checked={marketHoursOnly}
                description="Skip scanning outside regular market session."
                label="Market hours only"
                onChange={setMarketHoursOnly}
              />
            </div>
          </section>

          <section className="st-section" ref={(node) => (sectionRefs.current.strategy = node)}>
            <SectionHeader
              description="How signals are weighted, filtered, and interpreted."
              eyebrow="Signal logic"
              icon="T"
              title="Strategy & Horizon"
            />
            <div className="st-fields">
              <SettingsField label="Trading horizon">
                <SettingsSelect onChange={handleTradingHorizonChange} options={horizonOptions} value={tradingHorizon} />
              </SettingsField>
              <SettingsField hint="0–100" label="Signal threshold">
                <input
                  className="st-input"
                  min="0"
                  max="100"
                  onChange={(event) => setSignalThreshold(event.target.value)}
                  type="number"
                  value={signalThreshold}
                />
              </SettingsField>
              <SettingsField hint="0.1–5×" label="Risk multiplier">
                <input
                  className="st-input"
                  min="0.1"
                  max="5"
                  onChange={(event) => setRiskMultiplier(event.target.value)}
                  step="0.1"
                  type="number"
                  value={riskMultiplier}
                />
              </SettingsField>
              <div className="st-field st-field-info">
                <span className="st-flabel">Active horizon profile</span>
                <strong>{activeHorizonLabel}</strong>
                <small>{activeHorizonProfile.strategy_bias || HORIZON_SETTINGS[tradingHorizon].riskHint}</small>
                <small>
                  Recommended interval{" "}
                  {activeHorizonProfile.recommended_scan_interval ||
                    HORIZON_SETTINGS[tradingHorizon].interval}
                </small>
              </div>
            </div>
          </section>

          <section className="st-section" ref={(node) => (sectionRefs.current.automation = node)}>
            <SectionHeader
              accent="warn"
              description="Controls that affect what can happen without manual approval."
              eyebrow="Live execution"
              icon="A"
              title="Execution & Automation"
            />
            <div className="st-fields">
              <SettingsField label="Execution mode">
                <SettingsSelect onChange={setExecutionMode} options={executionModeOptions} value={executionMode} />
              </SettingsField>
              <SettingsField hint="0–100" label="Auto confidence threshold">
                <input
                  className="st-input"
                  min="0"
                  max="100"
                  onChange={(event) => setAutoExecuteConfidenceThreshold(event.target.value)}
                  type="number"
                  value={autoExecuteConfidenceThreshold}
                />
              </SettingsField>
              <SettingsField hint="$" label="Max auto trade size">
                <input
                  className="st-input"
                  min="0"
                  onChange={(event) => setMaxTradeSizeForAutoExecution(event.target.value)}
                  step="100"
                  type="number"
                  value={maxTradeSizeForAutoExecution}
                />
              </SettingsField>
            </div>
            <div className="st-switches">
              <SwitchRow
                caution="Live risk"
                checked={allowTradingNearEarnings}
                description="Permit entries inside the earnings window."
                label="Allow trading near earnings"
                onChange={setAllowTradingNearEarnings}
              />
              <SwitchRow
                caution="Live risk"
                checked={allowOvernightPositions}
                description="Hold positions past the close."
                label="Allow overnight positions"
                onChange={setAllowOvernightPositions}
              />
              <SwitchRow
                checked={pauseAutomationDuringMajorMacroEvents}
                description="Pause automation around scheduled macro releases."
                label="Pause during major macro events"
                onChange={setPauseAutomationDuringMajorMacroEvents}
              />
            </div>
          </section>

          <section
            className="st-section accent-safety"
            ref={(node) => (sectionRefs.current.risk = node)}
          >
            <SectionHeader
              accent="safety"
              description="Hard limits the safety manager enforces. Never bypassed."
              eyebrow="Capital protection"
              icon="S"
              title="Risk & Safety"
            />
            <div className="st-fields">
              <SettingsField hint="%" label="Max drawdown filter">
                <input
                  className="st-input"
                  min="0"
                  max="100"
                  onChange={(event) => setDrawdownThreshold(event.target.value)}
                  type="number"
                  value={drawdownThreshold}
                />
              </SettingsField>
              <SettingsField hint="%" label="Daily loss limit">
                <input
                  className="st-input"
                  min="0"
                  max="100"
                  onChange={(event) => setDailyLossLimit(event.target.value)}
                  step="0.1"
                  type="number"
                  value={dailyLossLimit}
                />
              </SettingsField>
              <SettingsField hint="%" label="Weekly loss limit">
                <input
                  className="st-input"
                  min="0"
                  max="100"
                  onChange={(event) => setWeeklyLossLimit(event.target.value)}
                  step="0.1"
                  type="number"
                  value={weeklyLossLimit}
                />
              </SettingsField>
            </div>
            <div className="st-save-row">
              <div className="st-active-limits">
                <span className="st-inline-glyph">S</span>
                Active limits · <strong>daily {formatSafetyPercent(safetyStatus?.limits?.max_daily_loss_pct)}</strong> /
                <strong> weekly {formatSafetyPercent(
                  safetyStatus?.limits?.max_weekly_loss_pct ??
                    safetyStatus?.limits?.max_weekly_drawdown_pct
                )}</strong>
              </div>
              <button className="st-btn primary" onClick={handleSaveSafetySettings} type="button">
                <span>S</span> Save Safety Limits
              </button>
            </div>
            {safetyError ? <p className="engine-error">{safetyError}</p> : null}
          </section>

          <section className="st-section" ref={(node) => (sectionRefs.current.markets = node)}>
            <SectionHeader
              description="The market universe and venues the scanner is allowed to search."
              eyebrow="What gets scanned"
              icon="G"
              title="Universe & Markets"
            />
            <div className="st-info-row">
              <InfoCard
                label="Market universe"
                note={highRiskMode ? "High-risk mode enabled: manual approval required." : "Safety filters active."}
                value={formatUniverseMode(universeMode)}
              />
              <InfoCard
                label="Market selection"
                note={includeSgx ? "SGX enabled: manual approval required for SGX trades." : "US-only scan mode."}
                value={formatPrimaryMarket(primaryMarket)}
              />
            </div>
            <div className="st-fields">
              <SettingsField label="Universe mode">
                <SettingsSelect
                  onChange={(value) => {
                    setUniverseMode(value);
                    setHighRiskMode(value === "HIGH_GROWTH_HIGH_RISK");
                  }}
                  options={universeModeOptions}
                  value={universeMode}
                />
              </SettingsField>
              <SettingsField label="Primary market">
                <SettingsSelect
                  onChange={(value) => {
                    setPrimaryMarket(value);
                    setIncludeSgx(value === "SG" || value === "BOTH");
                    if (value === "SG") {
                      setExchangeFilter("SGX");
                      setCurrencyDisplay("SGD");
                    }
                  }}
                  options={[
                    { value: "US", label: "US" },
                    { value: "SG", label: "Singapore" },
                    { value: "BOTH", label: "Both" },
                  ]}
                  value={primaryMarket}
                />
              </SettingsField>
              <SettingsField label="Exchange filter">
                <SettingsSelect
                  onChange={setExchangeFilter}
                  options={EXCHANGE_FILTERS.map((exchange) => ({ value: exchange, label: exchange }))}
                  value={exchangeFilter}
                />
              </SettingsField>
              <SettingsField label="Currency display">
                <SettingsSelect
                  onChange={setCurrencyDisplay}
                  options={[
                    { value: "AUTO", label: "Auto" },
                    { value: "USD", label: "USD" },
                    { value: "SGD", label: "SGD" },
                  ]}
                  value={currencyDisplay}
                />
              </SettingsField>
              <SettingsField hint="$10B" label="Minimum market cap">
                <input
                  className="st-input"
                  min="0"
                  onChange={(event) => setMinMarketCap(event.target.value)}
                  step="100000000"
                  type="number"
                  value={minMarketCap}
                />
              </SettingsField>
              <SettingsField hint="optional" label="Maximum market cap">
                <input
                  className="st-input"
                  min="0"
                  onChange={(event) => setMaxMarketCap(event.target.value)}
                  placeholder="No max"
                  step="100000000"
                  type="number"
                  value={maxMarketCap}
                />
              </SettingsField>
              <SettingsField hint="shares" label="Minimum average volume">
                <input
                  className="st-input"
                  min="0"
                  onChange={(event) => setMinAverageVolume(event.target.value)}
                  step="100000"
                  type="number"
                  value={minAverageVolume}
                />
              </SettingsField>
            </div>
            <div className="st-switches">
              <SwitchRow
                checked={includeSgx}
                description="Add Singapore Exchange listings. Manual approval required."
                label="Include SGX stocks"
                onChange={setIncludeSgx}
              />
              <SwitchRow
                checked={excludePennyStocks}
                description="Drop sub-threshold low-price names."
                label="Exclude penny stocks"
                onChange={setExcludePennyStocks}
              />
              <SwitchRow
                checked={includeNonSp500}
                description="Widen scanning beyond S&P 500 constituents."
                label="Include non-S&P 500 stocks"
                onChange={setIncludeNonSp500}
              />
              <SwitchRow
                caution="High risk"
                checked={highRiskMode}
                description="Unlock high-growth / high-risk universe rules."
                label="High-risk mode"
                onChange={setHighRiskMode}
              />
            </div>
          </section>

          <section
            className="st-section accent-engine"
            ref={(node) => (sectionRefs.current.engine = node)}
          >
            <SectionHeader
              accent="engine"
              description="The live scheduler that runs scans and automation."
              eyebrow="Runtime control"
              icon="P"
              title="Engine"
            />
            <div className="st-engine-row">
              <div className="st-engine-status">
                <span className={`st-engine-dot ${engineIsRunning ? "on" : "off"}`} />
                <div>
                  <span className="st-eyebrow">Status</span>
                  <strong className={engineIsRunning ? "pos" : "neg"}>
                    {engineIsRunning ? "Running" : "Stopped"}
                  </strong>
                </div>
              </div>
              <div className="st-engine-actions">
                <button
                  className="st-btn primary"
                  disabled={engineIsRunning || isEngineChanging}
                  onClick={handleStartEngine}
                  type="button"
                >
                  <span>▶</span> Start Engine
                </button>
                <button
                  className="st-btn danger"
                  disabled={!engineIsRunning || isEngineChanging}
                  onClick={handleStopEngine}
                  type="button"
                >
                  <span>■</span> Stop Engine
                </button>
              </div>
            </div>
            <p className="st-engine-note">
              <span className="st-inline-glyph">A</span>
              While running, the engine scans every {engineInterval} and follows the current execution mode:{" "}
              {formatExecutionMode(executionMode, EXECUTION_MODES)}.
            </p>
          </section>

          <section className="st-section" ref={(node) => (sectionRefs.current.universes = node)}>
            <SectionHeader
              description={`Named symbol groups, reusable across scanner, labs, and portfolio. ${stockUniverses.length} saved.`}
              eyebrow="Reusable sets"
              icon="L"
              title="Stock Universes"
            />
            {stockUniversesError ? <p className="engine-error">{stockUniversesError}</p> : null}

            <div className="st-uni-compose">
              <article className="st-uni-card">
                <div className="st-uni-head">
                  <span className="st-eyebrow">Create or edit</span>
                  <strong>Group definition</strong>
                </div>
                <div className="st-uni-form">
                  <SettingsField label="Name" wide>
                    <input
                      className="st-input"
                      onChange={(event) =>
                        setStockUniverseForm({
                          ...stockUniverseForm,
                          name: event.target.value,
                        })
                      }
                      placeholder="Momentum watchlist"
                      value={stockUniverseForm.name}
                    />
                  </SettingsField>
                  <SettingsField label="Universe type">
                    <SettingsSelect
                      onChange={(value) =>
                        setStockUniverseForm({
                          ...stockUniverseForm,
                          universeType: value,
                        })
                      }
                      options={[
                        { value: "MANUAL", label: "Manual" },
                        { value: "WATCHLIST", label: "Watchlist" },
                        { value: "SECTOR", label: "Sector" },
                        { value: "INDUSTRY", label: "Industry" },
                        { value: "S_AND_P_500_SAMPLE", label: "S&P 500 Sample" },
                        { value: "CUSTOM_SCREEN", label: "Custom Screen" },
                      ]}
                      value={stockUniverseForm.universeType}
                    />
                  </SettingsField>
                  <SettingsField label="Description" wide>
                    <textarea
                      className="st-input st-textarea"
                      onChange={(event) =>
                        setStockUniverseForm({
                          ...stockUniverseForm,
                          description: event.target.value,
                        })
                      }
                      placeholder="What this group is used for"
                      rows="3"
                      value={stockUniverseForm.description}
                    />
                  </SettingsField>
                  <SettingsField label="Symbols" wide>
                    <input
                      className="st-input"
                      onChange={(event) =>
                        setStockUniverseForm({
                          ...stockUniverseForm,
                          symbols: event.target.value.toUpperCase(),
                        })
                      }
                      placeholder="AAPL, MSFT, NVDA"
                      value={stockUniverseForm.symbols}
                    />
                  </SettingsField>
                </div>
                <div className="st-uni-actions">
                  <button className="st-btn primary" onClick={handleCreateStockUniverse} type="button">
                    <span>+</span> Create Group
                  </button>
                  <button
                    className="st-btn"
                    disabled={!selectedStockUniverseId}
                    onClick={handleUpdateStockUniverse}
                    type="button"
                  >
                    <span>S</span> Save Selected Edits
                  </button>
                </div>
              </article>

              <article className="st-uni-card">
                <div className="st-uni-head">
                  <span className="st-eyebrow">Quick sources</span>
                  <strong>Generate from existing data</strong>
                </div>
                <div className="st-uni-quick">
                  <button className="st-btn block" onClick={() => handleCreateUniverseFromSource("WATCHLIST")} type="button">
                    Save Watchlist
                  </button>
                  <button
                    className="st-btn block"
                    onClick={() => handleCreateUniverseFromSource("SCANNER_RESULTS")}
                    type="button"
                  >
                    Save Filtered Scanner
                  </button>
                </div>
                <div className="st-fields compact">
                  <SettingsField label="Create sector group">
                    <SettingsSelect
                      onChange={(value) => value && handleCreateUniverseFromSector("sector", value)}
                      options={[
                        { value: "", label: "Choose sector" },
                        ...availableSectors.map((sector) => ({ value: sector, label: sector })),
                      ]}
                      value=""
                    />
                  </SettingsField>
                  <SettingsField label="Create industry group">
                    <SettingsSelect
                      onChange={(value) => value && handleCreateUniverseFromSector("industry", value)}
                      options={[
                        { value: "", label: "Choose industry" },
                        ...availableIndustries.map((industry) => ({ value: industry, label: industry })),
                      ]}
                      value=""
                    />
                  </SettingsField>
                </div>
              </article>
            </div>

            <div className="st-uni-manage">
              <article className="st-uni-card">
                <div className="st-uni-head">
                  <span className="st-eyebrow">Groups</span>
                  <strong>{stockUniverses.length} universes</strong>
                </div>
                <StockUniverseSummary
                  handleDeleteStockUniverse={handleDeleteStockUniverse}
                  selectedStockUniverse={selectedStockUniverse}
                  setSelectedStockUniverseId={setSelectedStockUniverseId}
                  stockUniverses={stockUniverses}
                />
              </article>
              <article className="st-uni-card">
                <div className="st-uni-head">
                  <span className="st-eyebrow">Members</span>
                  <strong>{selectedStockUniverse ? selectedStockUniverse.name : "Select group"}</strong>
                </div>
                <StockUniverseMembers
                  handleAddStockUniverseMembers={handleAddStockUniverseMembers}
                  handleRemoveStockUniverseMember={handleRemoveStockUniverseMember}
                  selectedStockUniverse={selectedStockUniverse}
                  setStockUniverseMemberInput={setStockUniverseMemberInput}
                  stockUniverseMemberInput={stockUniverseMemberInput}
                />
              </article>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
