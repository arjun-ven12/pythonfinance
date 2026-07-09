import { Suspense, lazy } from "react";
import "./App.css";

const TradingCockpitApp = lazy(() =>
  import("./features/tradingCockpit/TradingCockpitApp")
);

export default function App() {
  return (
    <Suspense fallback={null}>
      <TradingCockpitApp />
    </Suspense>
  );
}
