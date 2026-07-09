function createChip(label, onRemove) {
  return { key: label, label, onRemove };
}

export function buildActiveScannerChips({
  drawdownThreshold,
  quickFilters,
  scanWatchlistOnly,
  scannerCurrencyFilter,
  scannerExchangeFilter,
  scannerMarketFilter,
  scoreThreshold,
  setDrawdownThreshold,
  setQuickFilters,
  setScanWatchlistOnly,
  setScannerCurrencyFilter,
  setScannerExchangeFilter,
  setScannerMarketFilter,
  setScoreThreshold,
}) {
  const chips = [];

  if (scannerMarketFilter !== "ALL") {
    chips.push(
      createChip(`Market: ${scannerMarketFilter}`, () => setScannerMarketFilter("ALL"))
    );
  }

  if (scannerExchangeFilter !== "ALL") {
    chips.push(
      createChip(`Exchange: ${scannerExchangeFilter}`, () => setScannerExchangeFilter("ALL"))
    );
  }

  if (scannerCurrencyFilter !== "ALL") {
    chips.push(
      createChip(`Currency: ${scannerCurrencyFilter}`, () => setScannerCurrencyFilter("ALL"))
    );
  }

  if (scanWatchlistOnly) {
    chips.push(createChip("Watchlist only", () => setScanWatchlistOnly(false)));
  }

  if (quickFilters.buyOnly) {
    chips.push(
      createChip("Buy only", () =>
        setQuickFilters((current) => ({ ...current, buyOnly: false }))
      )
    );
  }

  if (quickFilters.scoreAbove60) {
    chips.push(
      createChip(`Score > ${scoreThreshold}`, () => {
        setQuickFilters((current) => ({ ...current, scoreAbove60: false }));
        setScoreThreshold("60");
      })
    );
  }

  if (quickFilters.drawdownBelow10) {
    chips.push(
      createChip(`Drawdown < ${drawdownThreshold}`, () => {
        setQuickFilters((current) => ({ ...current, drawdownBelow10: false }));
        setDrawdownThreshold("10");
      })
    );
  }

  if (quickFilters.beatsBuyHold) {
    chips.push(
      createChip("Beat benchmark", () =>
        setQuickFilters((current) => ({ ...current, beatsBuyHold: false }))
      )
    );
  }

  return chips;
}
