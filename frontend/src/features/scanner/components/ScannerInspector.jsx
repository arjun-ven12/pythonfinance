import StockWorkspaceModal from "../../../components/stocks/StockWorkspaceModal";
import { useLiveQuote } from "../../marketData/hooks/useMarketDataSubscription";
import useTradingWorkspace from "../../watchlist/hooks/useTradingWorkspace";

export default function ScannerInspector({
  activeHorizonProfile,
  activeStrategy,
  compareItems,
  formatPercent,
  isOpen = false,
  onClose,
  onToggleWatchlist,
  selectedStock,
  watchlist,
}) {
  const selectedSymbol =
    selectedStock?.yahoo_symbol ||
    selectedStock?.yahooSymbol ||
    selectedStock?.display_symbol ||
    selectedStock?.symbol ||
    "";
  const { payload: liveQuote } = useLiveQuote(selectedSymbol);
  const workspace = useTradingWorkspace(
    selectedSymbol,
    liveQuote,
    {
      lastClose: selectedStock?.close,
      market: selectedStock?.market,
    }
  );

  return (
    <StockWorkspaceModal
      activeHorizonProfile={activeHorizonProfile}
      activeStrategy={activeStrategy}
      compareItems={compareItems}
      footerNote={
        selectedStock?.portfolio_fit?.explanation ||
        "Use this workspace to validate structure, compare broker context, and route a paper order with the current market snapshot."
      }
      formatPercent={formatPercent}
      isOpen={isOpen}
      liveQuote={liveQuote}
      onClose={onClose}
      onToggleWatchlist={onToggleWatchlist}
      selected={selectedStock ? { item: selectedStock, symbol: selectedStock.symbol } : null}
      watchlist={watchlist}
      workspace={workspace}
    />
  );
}
