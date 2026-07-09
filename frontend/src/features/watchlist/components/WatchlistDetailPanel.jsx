import StockWorkspaceSidebar from "../../../components/stocks/StockWorkspaceSidebar";
import useTradingWorkspace from "../hooks/useTradingWorkspace";

export default function WatchlistDetailPanel({
  liveQuote,
  onOpenStock,
  onRemove,
  selected,
}) {
  const selectedItem = selected?.item || null;
  const selectedSymbol = selected?.symbol || "";
  const workspace = useTradingWorkspace(
    selectedItem?.yahoo_symbol ||
      selectedItem?.yahooSymbol ||
      selectedItem?.display_symbol ||
      selectedItem?.symbol ||
      selectedSymbol,
    liveQuote,
    {
      lastClose: selectedItem?.close,
      market: selectedItem?.market,
    }
  );

  return (
    <StockWorkspaceSidebar
      footerNote={
        selectedItem?.portfolio_fit?.explanation ||
        "Scanner fit, strategy context, and broker-backed market data are aligned in this workspace."
      }
      liveQuote={liveQuote}
      onPrimaryAction={selectedItem ? onOpenStock : null}
      onSecondaryAction={selected?.symbol ? onRemove : null}
      primaryActionLabel={selectedItem ? "Open Stock Detail" : ""}
      secondaryActionLabel={selected?.symbol ? "Remove" : ""}
      secondaryActionTone="danger"
      selected={selected}
      workspace={workspace}
    />
  );
}
