import BackendMarketDataProvider from "./backendMarketDataProvider";

const provider = new BackendMarketDataProvider();

export function getMarketDataProvider() {
  return provider;
}

export function connectMarketData() {
  provider.connect();
  return provider;
}

export function disconnectMarketData() {
  provider.disconnect();
}
