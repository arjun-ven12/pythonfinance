import { useState } from "react";

export default function useStrategyLabUi() {
  const [section, setSection] = useState("Library");
  const [compareMode, setCompareMode] = useState("SINGLE");
  const [compareStrategyBId, setCompareStrategyBId] = useState("");
  const [dateRange, setDateRangeState] = useState({ startDate: "", endDate: "" });
  const [benchmark, setBenchmark] = useState("SPY");
  const [customBenchmark, setCustomBenchmark] = useState("");

  const toggleCompare = (enabled) => setCompareMode(enabled ? "COMPARE" : "SINGLE");
  const setDateRange = (nextRange) => {
    setDateRangeState((current) => ({ ...current, ...nextRange }));
  };

  return {
    section,
    setSection,
    compareMode,
    setCompareMode,
    toggleCompare,
    compareStrategyBId,
    setCompareStrategyBId,
    benchmark,
    setBenchmark,
    customBenchmark,
    setCustomBenchmark,
    dateRange,
    setDateRange,
    strategyLabSection: section,
    setStrategyLabSection: setSection,
    backtestCompareMode: compareMode,
    setBacktestCompareMode: setCompareMode,
    backtestStartDate: dateRange.startDate,
    setBacktestStartDate: (startDate) => setDateRange({ startDate }),
    backtestEndDate: dateRange.endDate,
    setBacktestEndDate: (endDate) => setDateRange({ endDate }),
    backtestBenchmark: benchmark,
    setBacktestBenchmark: setBenchmark,
  };
}

