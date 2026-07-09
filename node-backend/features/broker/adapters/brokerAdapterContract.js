const REQUIRED_METHODS = [
  "testConnection",
  "getHealth",
  "getAccountSummary",
  "getPositions",
  "getOpenOrders",
  "getMarketData",
  "previewOrder",
  "placeOrder",
  "cancelOrder",
  "modifyOrder",
  "getOrderStatus",
  "getExecutions",
  "disconnect",
];

function assertBrokerAdapterContract(adapter, label = "broker adapter") {
  const missing = REQUIRED_METHODS.filter((method) => typeof adapter?.[method] !== "function");
  if (!missing.length) return adapter;

  throw new Error(
    `${label} is missing required broker methods: ${missing.join(", ")}`
  );
}

module.exports = {
  REQUIRED_METHODS,
  assertBrokerAdapterContract,
};
