import StockPriceChart from "../stocks/StockPriceChart";
import { formatExchange } from "../../utils/marketMetadata";

function formatPercentValue(value) {
  const numericValue = Number(value || 0);
  return `${(numericValue * 100).toFixed(1)}%`;
}

export function OpenAiReasoningPanel({ reasoning }) {
  if (!reasoning) {
    return (
      <div className="ai-reasoning-panel">
        <p className="eyebrow">OpenAI news reasoning</p>
        <p className="muted-text">No OpenAI news reasoning available.</p>
      </div>
    );
  }

  return (
    <div className="ai-reasoning-panel">
      <div className="ai-reasoning-header">
        <p className="eyebrow">OpenAI news reasoning</p>
        <span
          className={`risk-pill ${String(
            reasoning.risk_level || "MEDIUM"
          ).toLowerCase()}`}
        >
          {reasoning.risk_level || "MEDIUM"} risk
        </span>
      </div>
      <dl className="detail-stats">
        <div>
          <dt>Sentiment</dt>
          <dd>{reasoning.sentiment || "NEUTRAL"}</dd>
        </div>
        <div>
          <dt>Confidence Adj.</dt>
          <dd>{Number(reasoning.confidence_adjustment || 0)}</dd>
        </div>
        <div>
          <dt>Allows Trade</dt>
          <dd>{reasoning.allow_trade ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <p>{reasoning.news_summary || "No summary available."}</p>
      <p className="muted-text">{reasoning.reasoning || "No reasoning provided."}</p>
    </div>
  );
}

export function NewsHealthPanel({ newsFilter }) {
  const providers = newsFilter?.provider_status || [];

  if (providers.length === 0) {
    return null;
  }

  return (
    <section className="news-health-panel">
      <div className="news-health-header">
        <div>
          <p className="eyebrow">News Health</p>
          <strong>Provider diagnostics</strong>
        </div>
        <span>{newsFilter.events?.length || 0} total events</span>
      </div>
      <div className="news-health-list">
        {providers.map((provider) => {
          const providerSucceeded =
            provider.success ?? provider.available ?? false;
          const hasConversionFailures =
            providerSucceeded && provider.errors?.length > 0;
          const state = !providerSucceeded
            ? "unavailable"
            : hasConversionFailures
              ? "warning"
              : "healthy";
          const label = String(provider.provider || "Provider")
            .replaceAll("_", " ")
            .replace(/\b\w/g, (character) => character.toUpperCase());

          return (
            <div className={`news-health-row ${state}`} key={provider.provider}>
              <div>
                <strong>{label}</strong>
                <span>
                  {state === "healthy"
                    ? "Healthy"
                    : state === "warning"
                      ? "Conversion failures"
                      : "Unavailable"}
                </span>
              </div>
              <div className="news-health-stats">
                <strong>{provider.eventCount || 0} events</strong>
                <span>{Number(provider.latencyMs || 0).toFixed(0)} ms</span>
              </div>
              {provider.errors?.length > 0 && (
                <p>{provider.errors.join(" ")}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ConfidenceBreakdownPanel({ breakdown }) {
  if (!breakdown) {
    return null;
  }

  const rows = [
    ["Technical", breakdown.technical_confidence],
    ["News filter", breakdown.news_adjustment],
    ["OpenAI", breakdown.openai_adjustment],
    ["Regime", breakdown.regime_adjustment],
    ["Final", breakdown.final_confidence],
  ];

  return (
    <div className="confidence-breakdown-panel">
      <p className="eyebrow">Confidence breakdown</p>
      <dl className="detail-stats">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{Number(value || 0).toFixed(2)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PortfolioFitPanel({ fit }) {
  if (!fit) {
    return null;
  }

  const recommendation = fit.recommendation || "WAIT";
  const exposure = fit.new_exposure_after_trade || {};
  const currentExposure = fit.current_portfolio_exposure || {};
  const sector = fit.sector_concentration || {};
  const riskBudget = fit.risk_budget_usage || {};
  const averaging = fit.averaging || {};
  const horizon = fit.horizon_compatibility || {};
  const stopRisk = fit.stop_loss_risk || {};

  return (
    <div className="portfolio-fit-panel">
      <div className="portfolio-fit-header">
        <div>
          <p className="eyebrow">Position-aware fit</p>
          <strong>{Number(fit.portfolio_fit_score || 0).toFixed(0)}/100</strong>
        </div>
        <span className={`recommendation-pill ${recommendation.toLowerCase()}`}>
          {recommendation.replaceAll("_", " ")}
        </span>
      </div>

      <dl className="detail-stats">
        <div>
          <dt>Adjusted Qty</dt>
          <dd>{Number(fit.adjusted_quantity || 0)}</dd>
        </div>
        <div>
          <dt>Exposure</dt>
          <dd>
            {formatPercentValue(currentExposure.pct)} to{" "}
            {formatPercentValue(exposure.pct)}
          </dd>
        </div>
        <div>
          <dt>Sector</dt>
          <dd>{sector.sector || "UNKNOWN"}</dd>
        </div>
        <div>
          <dt>Sector Exposure</dt>
          <dd>{formatPercentValue(sector.new_pct)}</dd>
        </div>
        <div>
          <dt>Risk Budget</dt>
          <dd>{formatPercentValue(riskBudget.usage_pct)}</dd>
        </div>
        <div>
          <dt>Stop Risk</dt>
          <dd>${Number(stopRisk.risk_amount || 0).toFixed(2)}</dd>
        </div>
        <div>
          <dt>Averaging</dt>
          <dd>{(averaging.mode || "NEW_POSITION").replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Horizon Fit</dt>
          <dd>{horizon.compatible === false ? "Mismatch" : "Compatible"}</dd>
        </div>
      </dl>

      <p>{fit.explanation || "No portfolio-fit explanation available."}</p>
    </div>
  );
}

export default function StockDetailDrawer({
  formatPercent,
  marketRegime,
  onClose,
  paperPosition,
  stock,
}) {
  if (!stock) {
    return null;
  }
  const exchange = formatExchange(stock.exchange, stock);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        aria-label={`${stock.symbol} detail panel`}
        className="stock-detail-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-header">
          <div>
            <p className="eyebrow">Stock detail</p>
            <h2>{stock.display_symbol || stock.symbol}</h2>
            <div className="market-badge-row">
              <span className={`market-badge ${stock.is_sgx ? "sgx" : "us"}`}>
                {exchange}
              </span>
              <span className="market-badge">{stock.market || "US"}</span>
              <span className="market-badge currency">{stock.currency || "USD"}</span>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <span className={`badge ${stock.signal.toLowerCase()}`}>{stock.signal}</span>

        <dl className="detail-stats drawer-stats">
          <div>
            <dt>Company</dt>
            <dd>{stock.company_name || stock.symbol}</dd>
          </div>
          <div>
            <dt>Yahoo Symbol</dt>
            <dd>{stock.yahoo_symbol || stock.symbol}</dd>
          </div>
          <div>
            <dt>Sector</dt>
            <dd>{stock.sector || "UNKNOWN"}</dd>
          </div>
          <div>
            <dt>Industry</dt>
            <dd>{stock.industry || "UNKNOWN"}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{stock.opportunity_score}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{stock.confidence}</dd>
          </div>
          <div>
            <dt>Backtest Return</dt>
            <dd>{formatPercent(stock.backtest_return)}</dd>
          </div>
          <div>
            <dt>Buy & Hold</dt>
            <dd>{formatPercent(stock.buy_and_hold)}</dd>
          </div>
          <div>
            <dt>Win Rate</dt>
            <dd>{formatPercent(stock.win_rate)}</dd>
          </div>
          <div>
            <dt>Drawdown</dt>
            <dd>{formatPercent(stock.drawdown)}</dd>
          </div>
          <div>
            <dt>Market Regime</dt>
            <dd>{marketRegime.replaceAll("_", " ")}</dd>
          </div>
        </dl>

        <StockPriceChart
          defaultRange="1Y"
          market={stock.market}
          symbol={stock.yahoo_symbol || stock.display_symbol || stock.symbol}
        />

        <div className="detail-reasons">
          <p className="eyebrow">Reasons</p>
          <ul>
            {stock.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>

        <ConfidenceBreakdownPanel breakdown={stock.confidence_breakdown} />

        <PortfolioFitPanel fit={stock.portfolio_fit} />

        <NewsHealthPanel newsFilter={stock.news_filter} />

        <OpenAiReasoningPanel reasoning={stock.openai_news_reasoning} />

        <div className="paper-position-panel">
          <p className="eyebrow">Paper position</p>
          {paperPosition ? (
            <dl className="detail-stats">
              <div>
                <dt>Quantity</dt>
                <dd>{paperPosition.quantity}</dd>
              </div>
              <div>
                <dt>Average Price</dt>
                <dd>{Number(paperPosition.avg_price).toFixed(2)}</dd>
              </div>
              <div>
                <dt>Last Price</dt>
                <dd>{Number(paperPosition.last_price).toFixed(2)}</dd>
              </div>
            </dl>
          ) : (
            <p className="alerts-empty">No paper position for this symbol.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
