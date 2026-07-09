import { useCallback, useRef, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";
import { getTradingSession } from "../../broker/hooks/brokerApi";

const EMPTY_TRADE_FORM = {
  symbol: "",
  side: "BUY",
  status: "OPEN",
  entryPrice: "",
  quantity: "",
  stopLoss: "",
  takeProfit: "",
  notes: "",
};

export default function useTrades({ data }) {
  const [tradesData, setTradesData] = useState({ trades: [] });
  const [tradeForm, setTradeForm] = useState(EMPTY_TRADE_FORM);
  const [tradeError, setTradeError] = useState("");
  const latestPriceCacheRef = useRef({});
  const latestPriceRequestRef = useRef({});

  const fetchTrades = useCallback(async () => {
    try {
      const response = await getTradingSession();
      const session = response.session || {};
      setTradesData({
        provider: session.provider,
        source: session.source,
        trades: session.trades || [],
      });
    } catch (err) {
      setTradesData({ trades: [], error: err.message });
    }
  }, []);

  const getScannedClosePriceInput = useCallback((symbolValue) => {
    const symbol = String(symbolValue || "").trim().toUpperCase();
    if (!symbol || !data?.opportunities?.length) return null;
    const match = data.opportunities.find(
      (opportunity) => String(opportunity.symbol || "").toUpperCase() === symbol
    );
    const close = Number(match?.close);
    return Number.isFinite(close) && close > 0 ? close.toFixed(2) : null;
  }, [data]);

  const fetchLatestClosePriceInput = useCallback(async (symbol) => {
    if (latestPriceCacheRef.current[symbol]) return latestPriceCacheRef.current[symbol];
    const response = await fetch(`${API_BASE_URL}/api/market-data/${symbol}/quote`);
    if (!response.ok) return null;
    const result = await response.json().catch(() => null);
    const close = Number(result?.quote?.last);
    if (!Number.isFinite(close) || close <= 0) return null;
    const priceInput = close.toFixed(2);
    latestPriceCacheRef.current[symbol] = priceInput;
    return priceInput;
  }, []);

  const autofillLatestClosePrice = useCallback((formName, symbolValue, setForm) => {
    const symbol = String(symbolValue || "").trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return;
    const scannedClose = getScannedClosePriceInput(symbol);
    if (scannedClose) {
      setForm((current) =>
        String(current.symbol || "").trim().toUpperCase() === symbol
          ? { ...current, entryPrice: scannedClose }
          : current
      );
      return;
    }
    latestPriceRequestRef.current[formName] = symbol;
    fetchLatestClosePriceInput(symbol)
      .then((latestClose) => {
        if (!latestClose || latestPriceRequestRef.current[formName] !== symbol) return;
        setForm((current) =>
          String(current.symbol || "").trim().toUpperCase() === symbol
            ? { ...current, entryPrice: latestClose }
            : current
        );
      })
      .catch(() => {});
  }, [fetchLatestClosePriceInput, getScannedClosePriceInput]);

  const handleTradeFieldChange = useCallback((field, value) => {
    setTradeForm((current) => {
      if (field !== "symbol") return { ...current, [field]: value };
      const symbol = value.toUpperCase();
      const latestClose = getScannedClosePriceInput(symbol);
      return { ...current, symbol, ...(latestClose ? { entryPrice: latestClose } : {}) };
    });
    if (field === "symbol") {
      autofillLatestClosePrice("trade", value, setTradeForm);
    }
  }, [autofillLatestClosePrice, getScannedClosePriceInput]);

  const handleTradeSubmit = useCallback(async (event) => {
    event.preventDefault();
    setTradeError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradeForm),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Unable to save trade");
      }
      setTradeForm(EMPTY_TRADE_FORM);
      fetchTrades();
    } catch (err) {
      setTradeError(err.message);
    }
  }, [fetchTrades, tradeForm]);

  const latestCloseBySymbol = (data?.opportunities || []).reduce((acc, item) => {
    const close = Number(item.close ?? item.latest_close ?? item.latestClose);
    if (item.symbol && Number.isFinite(close)) acc[item.symbol] = close;
    return acc;
  }, {});
  const openTrades = (tradesData.trades || []).filter((trade) => trade.status !== "CLOSED");
  const closedTrades = (tradesData.trades || []).filter((trade) => trade.status === "CLOSED");
  const calculateUnrealizedPnL = (trade) => {
    const latestClose = latestCloseBySymbol[trade.symbol];
    if (!latestClose) return null;
    const direction = trade.side === "SELL" ? -1 : 1;
    return (latestClose - Number(trade.entryPrice)) * Number(trade.quantity) * direction;
  };
  const manualOpenTradePositions = openTrades.map((trade) => {
    const latestClose = latestCloseBySymbol[trade.symbol];
    const entryPrice = Number(trade.entryPrice) || 0;
    const quantity = Number(trade.quantity) || 0;
    const marketPrice = latestClose || entryPrice;
    const marketValue = marketPrice * quantity;
    const unrealizedPnL = calculateUnrealizedPnL(trade);
    return { ...trade, entryPrice, quantity, latestClose, marketValue, unrealizedPnL };
  });
  const manualOpenTradeValue = manualOpenTradePositions.reduce(
    (total, trade) => total + trade.marketValue,
    0
  );

  return {
    autofillLatestClosePrice,
    calculateUnrealizedPnL,
    closedTrades,
    fetchTrades,
    getScannedClosePriceInput,
    handleTradeFieldChange,
    handleTradeSubmit,
    manualOpenTradePositions,
    manualOpenTradeValue,
    openTrades,
    tradeError,
    tradeForm,
    tradesData,
  };
}
