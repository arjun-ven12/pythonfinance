import { useEffect, useMemo, useState } from "react";

const DEFAULT_STEPS = [
  { label: "Establishing secure channel", detail: "TLS 1.3" },
  { label: "Syncing market data feeds", detail: "NYSE · SGX · LSE" },
  { label: "Loading positions and balances", detail: "desk · level 2" },
  { label: "Arming order routing", detail: "FIX 4.4" },
  { label: "Calibrating risk engine", detail: "VaR · limits" },
];

function BrandMark() {
  return (
    <svg aria-hidden="true" className="loading-brand-mark" viewBox="0 0 60 60">
      <rect x="1.3" y="1.3" width="57.4" height="57.4" rx="15" />
      <rect className="loading-brand-bar loading-brand-bar-1" x="15" y="28" width="5" height="17" rx="2.5" />
      <rect className="loading-brand-bar loading-brand-bar-2" x="27" y="16" width="5" height="29" rx="2.5" />
      <rect className="loading-brand-bar loading-brand-bar-3" x="39" y="22" width="5" height="23" rx="2.5" />
    </svg>
  );
}

export default function LoadingTerminalScreen({
  status = "Initializing terminal",
  title = "Quant's Trade",
  steps = DEFAULT_STEPS,
}) {
  const [progress, setProgress] = useState(0);
  const circumference = useMemo(() => 2 * Math.PI * 80, []);

  useEffect(() => {
    const duration = 3800;
    const start = performance.now();
    let frameId = null;

    const tick = (now) => {
      const nextProgress = Math.min((now - start) / duration, 0.98);
      setProgress(nextProgress);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, []);

  const activeIndex = Math.min(
    Math.floor(progress * steps.length),
    Math.max(steps.length - 1, 0)
  );

  return (
    <main className="loading-shell">
      <section className="loading-stage">
        <div className="loading-ring-wrap">
          <div aria-hidden="true" className="loading-halo" />
          <svg aria-hidden="true" className="loading-ring" viewBox="0 0 172 172">
            <circle className="loading-track" cx="86" cy="86" r="80" />
            <circle
              className="loading-progress"
              cx="86"
              cy="86"
              r="80"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: circumference * (1 - progress),
              }}
            />
          </svg>
          <div
            aria-hidden="true"
            className="loading-tip"
            style={{ transform: `rotate(${progress * 360}deg)` }}
          >
            <span className="loading-tip-dot" />
          </div>
          <BrandMark />
        </div>

        <div className="loading-word">
          {title.replace("OS", "")}
          <span>OS</span>
        </div>
        <div aria-live="polite" className="loading-pct" role="status">
          <span>{steps[activeIndex]?.label || status}</span>
          <span className="loading-pct-sep" />
          <span className="loading-pct-num">{Math.round(progress * 100)}%</span>
        </div>

        <section aria-label="System initialization" className="loading-log">
          <span className="loading-corner loading-corner-tl" />
          <span className="loading-corner loading-corner-tr" />
          <span className="loading-corner loading-corner-bl" />
          <span className="loading-corner loading-corner-br" />
          {steps.map((step, index) => {
            const state =
              progress >= (index + 1) / steps.length
                ? "done"
                : index === activeIndex
                  ? "active"
                  : "pending";

            return (
              <div
                className={`loading-row loading-row-${state}`}
                key={step.label}
              >
                <div className="loading-glyph">
                  <span className="loading-pend" />
                  <span className="loading-spin" />
                  <span className="loading-check">✓</span>
                </div>
                <span className="loading-label">{step.label}</span>
                <span className="loading-detail">{step.detail}</span>
              </div>
            );
          })}
        </section>

        <p className="loading-status-note">{status}</p>
      </section>

      <footer className="loading-footer">
        <span>Encrypted</span>
        <span>Session · rotating</span>
        <span>Latency · 12ms</span>
        <span>Quant&apos;s Trade v2026.06 · main</span>
      </footer>
    </main>
  );
}
