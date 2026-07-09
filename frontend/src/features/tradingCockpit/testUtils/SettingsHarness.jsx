import useSettings from "../../settings/hooks/useSettings";

const savedSettings = {
  alertThreshold: "60",
  allowOvernightPositions: true,
  allowTradingNearEarnings: false,
  autoExecuteConfidenceThreshold: "85",
  currencyDisplay: "AUTO",
  dailyLossLimit: "2",
  drawdownThreshold: "10",
  engineInterval: "15min",
  exchangeFilter: "ALL",
  excludePennyStocks: true,
  executionMode: "MANUAL_APPROVAL",
  highRiskMode: false,
  includeNonSp500: false,
  includeSgx: false,
  marketHoursOnly: true,
  maxMarketCap: "",
  maxTradeSizeForAutoExecution: "1000",
  minAverageVolume: "1000000",
  minMarketCap: "10000000000",
  pauseAutomationDuringMajorMacroEvents: true,
  primaryMarket: "US",
  riskMultiplier: "1",
  scanLimit: "50",
  scanWatchlistOnly: false,
  scoreThreshold: "60",
  signalThreshold: "70",
  tradingHorizon: "SWING",
  universeMode: "S_AND_P_500",
  weeklyLossLimit: "5",
};

export default function SettingsHarness() {
  const settings = useSettings({
    activeTab: "Dashboard",
    adminTabs: new Set(["Playbook"]),
    currentUser: {
      role: "LEVEL_2_ADMIN",
    },
    displayedRef: { current: [] },
    getUserStorageKey: (key) => key,
    horizonSettings: {
      SWING: {
        interval: "15min",
        marketHoursOnly: true,
        signalThreshold: "70",
      },
    },
    onAdminModeRequired: () => {},
    onForceDashboard: () => {},
    refreshUser: async () => {},
    savedSettings,
    setPortfolioConstructionError: () => {},
    setRiskDashboardError: () => {},
  });

  return (
    <button onClick={() => settings.setAdminMode(true)} type="button">
      Enable Admin
    </button>
  );
}
