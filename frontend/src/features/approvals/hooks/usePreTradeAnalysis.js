import { useCallback, useRef, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";
import {
  EMPTY_PRE_TRADE_FORM,
  buildPreTradeFormFromApproval,
  normalizePreTradePayload,
} from "../utils/approvalForms";
import { runPreTradeAnalysis } from "../services/approvalsApi";

function getScannedClosePriceInput(data, symbolValue) {
  const symbol = String(symbolValue || "").trim().toUpperCase();
  if (!symbol || !data?.opportunities?.length) return null;

  const match = data.opportunities.find(
    (opportunity) => String(opportunity.symbol || "").toUpperCase() === symbol
  );
  const close = Number(match?.close);

  return Number.isFinite(close) && close > 0 ? close.toFixed(2) : null;
}

export default function usePreTradeAnalysis({ data, tradingHorizon }) {
  const [form, setForm] = useState(EMPTY_PRE_TRADE_FORM);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const latestPriceCacheRef = useRef({});
  const latestPriceRequestRef = useRef("");

  const fetchLatestClosePriceInput = useCallback(async (symbol) => {
    if (latestPriceCacheRef.current[symbol]) return latestPriceCacheRef.current[symbol];

    const response = await fetch(`${API_BASE_URL}/api/market-data/${symbol}/quote`);
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    const close = Number(payload?.quote?.last);

    if (!Number.isFinite(close) || close <= 0) return null;

    const priceInput = close.toFixed(2);
    latestPriceCacheRef.current[symbol] = priceInput;
    return priceInput;
  }, []);

  const autofillLatestClosePrice = useCallback(
    (symbolValue) => {
      const symbol = String(symbolValue || "").trim().toUpperCase();
      if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return;

      const scannedClose = getScannedClosePriceInput(data, symbol);
      if (scannedClose) {
        setForm((current) =>
          String(current.symbol || "").trim().toUpperCase() === symbol
            ? { ...current, entryPrice: scannedClose }
            : current
        );
        return;
      }

      latestPriceRequestRef.current = symbol;
      fetchLatestClosePriceInput(symbol)
        .then((latestClose) => {
          if (!latestClose || latestPriceRequestRef.current !== symbol) return;
          setForm((current) =>
            String(current.symbol || "").trim().toUpperCase() === symbol
              ? { ...current, entryPrice: latestClose }
              : current
          );
        })
        .catch(() => {});
    },
    [data, fetchLatestClosePriceInput]
  );

  const updateField = useCallback(
    (field, value) => {
      setForm((current) => {
        if (field !== "symbol") {
          return {
            ...current,
            [field]: value,
          };
        }

        const symbol = value.toUpperCase();
        const latestClose = getScannedClosePriceInput(data, symbol);

        return {
          ...current,
          symbol,
          ...(latestClose ? { entryPrice: latestClose } : {}),
        };
      });

      if (field === "symbol") {
        autofillLatestClosePrice(value);
      }
    },
    [autofillLatestClosePrice, data]
  );

  const analyze = useCallback(
    async (event) => {
      event?.preventDefault?.();
      setLoading(true);
      setError("");
      setResult(null);

      try {
        const nextResult = await runPreTradeAnalysis(
          normalizePreTradePayload(form, tradingHorizon)
        );
        setResult(nextResult);
        return nextResult;
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [form, tradingHorizon]
  );

  const reset = useCallback((nextForm = EMPTY_PRE_TRADE_FORM) => {
    setForm(nextForm);
    setResult(null);
    setError("");
  }, []);

  const buildFromApproval = useCallback(
    (request) => {
      reset(buildPreTradeFormFromApproval(request));
    },
    [reset]
  );

  return {
    analyze,
    buildFromApproval,
    error,
    form,
    loading,
    reset,
    result,
    updateField,
  };
}
