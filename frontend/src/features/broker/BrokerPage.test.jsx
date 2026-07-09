import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BrokerPage, { sanitizeBrokerConfigForStorage } from "./BrokerPage";

vi.mock("./hooks/brokerApi", () => ({
  brokerRequest: vi.fn(),
  getBrokerConfig: vi.fn(async (provider) => ({
    provider,
    executionMode: provider === "MOOMOO" ? "PAPER_BROKER" : "READ_ONLY",
    config:
      provider === "MOOMOO"
        ? {
            host: "127.0.0.1",
            port: 11111,
            transport: "websocket",
            tradeEnv: "SIMULATE",
            securityFirm: "MOOMOO",
            market: "US",
            websocketSsl: false,
            accountId: "",
          }
        : {},
    effectiveConfig:
      provider === "MOOMOO"
        ? {
            host: "127.0.0.1",
            port: 11111,
            transport: "python_bridge",
            tradeEnv: "SIMULATE",
            securityFirm: "MOOMOO",
            market: "US",
            websocketSsl: false,
            accountId: "",
          }
        : {},
    effectiveTarget: provider === "MOOMOO" ? "127.0.0.1:11111" : null,
    secretStatus: {
      configured: false,
      provider,
      lastUpdatedAt: null,
    },
  })),
  getBrokerAccounts: vi.fn(async () => ({
    accounts: [
      {
        accountId: "12345",
        accountType: "Margin",
        tradeEnv: "SIMULATE",
        market: "US",
        displayName: "Margin · SIMULATE · 12345",
      },
    ],
  })),
  saveSelectedBrokerConfig: vi.fn(async (provider, config) => ({
    provider,
    executionMode: provider === "MOOMOO" ? "PAPER_BROKER" : "READ_ONLY",
    config,
  })),
  importBrokerOrder: vi.fn(async () => ({
    imported: true,
    alreadyTracked: false,
    brokerOrder: {
      id: "order-imported",
      brokerOrderId: "2964408",
    },
  })),
  syncBrokerOrder: vi.fn(async () => ({
    ok: true,
  })),
  markBrokerOrderCancelled: vi.fn(async () => ({
    id: "order-1",
    status: "CANCELLED",
  })),
  syncBrokerLedger: vi.fn(async () => ({
    syncSummary: {
      positionsTouched: 2,
      cashAdjustment: 995990.65,
    },
    reconciliation: {
      status: "CLEAN",
      syncScore: 100,
    },
    preflight: {
      overall: "PASS",
      checks: [],
    },
  })),
  saveBrokerSecrets: vi.fn(async (provider) => ({
    configured: true,
    provider,
    lastUpdatedAt: "2026-07-02T12:00:00.000Z",
    keyVersion: "current",
  })),
}));

import {
  brokerRequest,
  getBrokerAccounts,
  getBrokerConfig,
  importBrokerOrder,
  markBrokerOrderCancelled,
  saveSelectedBrokerConfig,
  saveBrokerSecrets,
  syncBrokerOrder,
  syncBrokerLedger,
} from "./hooks/brokerApi";

const baseProps = {
  account: {
    provider: "MOOMOO",
    available: true,
    positions: [],
    openOrders: [],
  },
  capabilities: {
    provider: "MOOMOO",
    canReadAccount: true,
    canReadPositions: true,
    canReadOpenOrders: true,
    canPlaceOrders: false,
    liveExecutionEnabled: false,
    supports: {},
    notes: [],
  },
  config: null,
  error: "",
  fills: [],
  health: {
    provider: "MOOMOO",
    connected: true,
    gatewayRunning: true,
    paperMode: true,
    accountLoaded: true,
    marketDataAvailable: true,
    orderPermission: false,
    status: "CONNECTED",
    protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
    config: {
      host: "127.0.0.1",
      port: 11111,
      defaultTrdEnv: "SIMULATE",
      transport: "websocket",
    },
  },
  isSaving: false,
  isTesting: false,
  logs: [],
  onChange: vi.fn(),
  onRefresh: vi.fn(),
  onSave: vi.fn(),
  onTest: vi.fn(),
  orders: [],
  preflight: { checks: [], overall: "PASS" },
  reconciliation: {
    status: "CLEAN",
    syncScore: 100,
    missingPositions: [],
    extraPositions: [],
    positionDifferences: [],
  },
};

function renderPage(props = {}) {
  return render(<BrokerPage {...baseProps} {...props} />);
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

function getBrokerHealthCard() {
  const match = screen
    .getAllByText("Broker Health")
    .map((node) => node.closest("article"))
    .find(Boolean);

  if (!match) {
    throw new Error("Broker Health card not found");
  }

  return match;
}

function getSecretInput(label) {
  const card = getBrokerHealthCard();
  return within(card).getByLabelText(label);
}

function getActionButton(name) {
  const card = getBrokerHealthCard();
  return within(card).getByRole("button", { name });
}

describe("BrokerPage storage hardening", () => {
  it("sanitizer removes secret-like keys", () => {
    expect(
      sanitizeBrokerConfigForStorage({
        host: "127.0.0.1",
        tradingPasswordMd5: "secret",
        apiKey: "abc",
        websocketKey: "def",
        transport: "websocket",
      })
    ).toEqual({
      host: "127.0.0.1",
      transport: "websocket",
    });
  });

  it("broker safe config persists to localStorage", async () => {
    renderPage();

    const hostInput = screen.getByLabelText("Host");
    fireEvent.change(hostInput, { target: { value: "10.0.0.2" } });

    await waitFor(() => {
      const payload = JSON.parse(
        window.localStorage.getItem("brokerCenterDraftConfig") || "{}"
      );
      expect(payload.MOOMOO.host).toBe("10.0.0.2");
    });
  });

  it("backend config overrides stale localStorage port drafts", async () => {
    window.localStorage.setItem(
      "brokerCenterDraftConfig",
      JSON.stringify({
        MOOMOO: {
          host: "127.0.0.1",
          port: "33333",
          transport: "websocket",
        },
      })
    );

    renderPage();

    expect((await screen.findByLabelText("Port")).value).toBe("11111");
  });

  it("secret fields do not persist to localStorage", async () => {
    renderPage();

    const secretInput = getSecretInput("Trading password MD5");
    fireEvent.change(secretInput, { target: { value: "md5-secret" } });

    await waitFor(() => {
      const raw = window.localStorage.getItem("brokerCenterDraftConfig") || "";
      expect(raw).not.toContain("md5-secret");
      expect(raw).not.toContain("tradingPasswordMd5");
    });
  });

  it("old localStorage payload with secret keys is cleaned", async () => {
    window.localStorage.setItem(
      "brokerCenterDraftConfig",
      JSON.stringify({
        MOOMOO: {
          host: "127.0.0.1",
          tradingPasswordMd5: "legacy-secret",
          websocketKey: "legacy-key",
        },
      })
    );

    renderPage();

    await waitFor(() => {
      const payload = JSON.parse(
        window.localStorage.getItem("brokerCenterDraftConfig") || "{}"
      );
      expect(payload.MOOMOO.host).toBe("127.0.0.1");
      expect(payload.MOOMOO.tradingPasswordMd5).toBeUndefined();
      expect(payload.MOOMOO.websocketKey).toBeUndefined();
    });
  });

  it("secret inputs clear after save", async () => {
    renderPage();

    fireEvent.change(getSecretInput("Trading password MD5"), {
      target: { value: "md5-secret" },
    });
    fireEvent.change(getSecretInput("OpenD auth key"), {
      target: { value: "socket-secret" },
    });
    fireEvent.click(getActionButton("Save Config"));

    await waitFor(() => {
      expect(saveBrokerSecrets).toHaveBeenCalledWith("MOOMOO", {
        tradingPasswordMd5: "md5-secret",
        websocketKey: "socket-secret",
      });
    });

    await waitFor(() => {
      expect(saveSelectedBrokerConfig).toHaveBeenCalledWith(
        "MOOMOO",
        expect.objectContaining({
          host: "127.0.0.1",
          port: "11111",
          tradeEnv: "SIMULATE",
          transport: "python_bridge",
        }),
        "PAPER_BROKER"
      );
    });

    await waitFor(() => {
      expect(getSecretInput("Trading password MD5").value).toBe("");
      expect(getSecretInput("OpenD auth key").value).toBe("");
    });
  });

  it("logout clears secret draft state", async () => {
    renderPage();

    fireEvent.change(getSecretInput("Trading password MD5"), {
      target: { value: "md5-secret" },
    });
    window.dispatchEvent(new CustomEvent("trading-dashboard:logout"));

    await waitFor(() => {
      expect(getSecretInput("Trading password MD5").value).toBe("");
    });
  });

  it("shows backend secret status without rendering secret values", async () => {
    getBrokerConfig.mockResolvedValueOnce({
      provider: "MOOMOO",
      executionMode: "PAPER_BROKER",
      config: {
        host: "127.0.0.1",
        port: 11111,
        transport: "websocket",
        tradeEnv: "SIMULATE",
      },
      effectiveConfig: {
        host: "127.0.0.1",
        port: 11111,
        transport: "websocket",
        tradeEnv: "SIMULATE",
      },
      effectiveTarget: "127.0.0.1:11111",
      secretStatus: {
        configured: true,
        provider: "MOOMOO",
        lastUpdatedAt: "2026-07-02T12:00:00.000Z",
      },
    });

    renderPage();

    expect(await screen.findByText(/Secret status: Configured/i)).toBeTruthy();
    expect(screen.queryByText(/^current$/i)).toBeNull();
  });

  it("test connection submits secrets directly and clears them after success", async () => {
    brokerRequest.mockResolvedValueOnce({
      result: { connected: true },
      secretStatus: {
        configured: true,
        provider: "MOOMOO",
        lastUpdatedAt: "2026-07-02T12:00:00.000Z",
      },
    });

    renderPage();

    fireEvent.change(getSecretInput("Trading password MD5"), {
      target: { value: "md5-secret" },
    });
    fireEvent.click(getActionButton("Test Connection"));

    await waitFor(() => {
      expect(brokerRequest).toHaveBeenCalledWith(
        "/api/broker/test-connection",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    const [, options] = brokerRequest.mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({
      provider: "MOOMOO",
      secrets: { tradingPasswordMd5: "md5-secret" },
    });

    await waitFor(() => {
      expect(getSecretInput("Trading password MD5").value).toBe("");
    });
  });

  it("displays effective connection target from backend config", async () => {
    renderPage();

    expect(await screen.findByText("127.0.0.1:11111")).toBeTruthy();
    expect(screen.getByText(/PYTHON BRIDGE TCP SDK · SIMULATE/i)).toBeTruthy();
    expect(screen.getByText(/Configured transport: WEBSOCKET/i)).toBeTruthy();
  });

  it("loads accounts and allows selecting one", async () => {
    renderPage();

    fireEvent.click(getActionButton("Refresh Accounts"));

    expect(await screen.findByText(/Loaded 1 account/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Account Selection"), {
      target: { value: "SIMULATE:12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select Account" }));

    await waitFor(() => {
      expect(saveSelectedBrokerConfig).toHaveBeenCalledWith(
        "MOOMOO",
        expect.objectContaining({
          accountId: "12345",
          tradeEnv: "SIMULATE",
        }),
        "PAPER_BROKER"
      );
    });
    expect(getBrokerAccounts).toHaveBeenCalledWith("MOOMOO");
  });

  it("keeps a saved account selected after the page reloads", async () => {
    getBrokerConfig.mockResolvedValueOnce({
      provider: "MOOMOO",
      executionMode: "PAPER_BROKER",
      config: {
        host: "127.0.0.1",
        port: 11111,
        transport: "python_bridge",
        tradeEnv: "SIMULATE",
        accountId: "12345",
      },
      effectiveConfig: {
        host: "127.0.0.1",
        port: 11111,
        transport: "python_bridge",
        tradeEnv: "SIMULATE",
        accountId: "12345",
      },
      effectiveTarget: "127.0.0.1:11111",
      secretStatus: {
        configured: false,
        provider: "MOOMOO",
        lastUpdatedAt: null,
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText("Account Selection").value).toBe("SIMULATE:12345");
    });
  });

  it("syncs the cockpit ledger from the broker account", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sync Ledger From Broker" }));
    fireEvent.click(screen.getByRole("button", { name: "Sync ledger" }));

    await waitFor(() => {
      expect(syncBrokerLedger).toHaveBeenCalledTimes(1);
    });
  });

  it("automatically starts a background sync when reconciliation drift is detected", async () => {
    renderPage({
      reconciliation: {
        status: "WARNING",
        syncScore: 67,
        cashDifference: 1500,
        missingPositions: [{ symbol: "AMD" }],
        extraPositions: [],
        positionDifferences: [],
      },
    });

    await waitFor(() => {
      expect(syncBrokerLedger).toHaveBeenCalledTimes(1);
    });

    expect(screen.getAllByText("Broker successfully synchronized.").length).toBeGreaterThan(0);
  });

  it("shows a refresh button beside tracked broker orders", async () => {
    renderPage({
      orders: [
        {
          id: "order-1",
          symbol: "AMD",
          side: "BUY",
          quantity: 1,
          orderType: "LIMIT",
          status: "SUBMITTED",
          clientOrderId: "CID-1",
          limitPrice: 150,
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(syncBrokerOrder).toHaveBeenCalledWith("order-1");
    });
  });

  it("groups terminal broker orders away from the open-orders section", async () => {
    renderPage({
      orders: [
        {
          id: "order-open",
          symbol: "AMD",
          side: "BUY",
          quantity: 1,
          orderType: "LIMIT",
          status: "SUBMITTED",
          clientOrderId: "CID-OPEN",
          limitPrice: 150,
        },
        {
          id: "order-cancelled",
          symbol: "NVDA",
          side: "SELL",
          quantity: 2,
          orderType: "LIMIT",
          status: "CANCELLED",
          clientOrderId: "CID-CANCELLED",
          limitPrice: 160,
        },
      ],
    });

    expect(screen.getByText("Active broker orders")).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
    expect(screen.getByText("CID-CANCELLED")).toBeTruthy();
  });

  it("imports a broker-only mismatch into Quant's Trade", async () => {
    renderPage({
      reconciliation: {
        status: "CLEAN",
        syncScore: 100,
        missingPositions: [],
        extraPositions: [],
        positionDifferences: [],
        openOrderDifferences: [
          {
            symbol: "MU",
            status: "MISSING_IN_APP",
            clientOrderId: null,
            brokerOrderId: "2964408",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(importBrokerOrder).toHaveBeenCalledWith({
        brokerOrderId: "2964408",
        symbol: "MU",
      });
    });
  });

  it("syncs a tracked mismatch order from reconciliation", async () => {
    renderPage({
      reconciliation: {
        status: "CLEAN",
        syncScore: 100,
        missingPositions: [],
        extraPositions: [],
        positionDifferences: [],
        openOrderDifferences: [
          {
            localOrderId: "order-1",
            symbol: "GOOG",
            status: "MISSING_AT_BROKER",
            clientOrderId: "CID-1",
            brokerOrderId: "2964481",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sync Status" }));

    await waitFor(() => {
      expect(syncBrokerOrder).toHaveBeenCalledWith("order-1");
    });
  });

  it("allows marking a tracked mismatch order as cancelled", async () => {
    renderPage({
      reconciliation: {
        status: "CLEAN",
        syncScore: 100,
        missingPositions: [],
        extraPositions: [],
        positionDifferences: [],
        openOrderDifferences: [
          {
            localOrderId: "order-1",
            symbol: "GOOG",
            status: "MISSING_AT_BROKER",
            clientOrderId: "CID-1",
            brokerOrderId: "2964481",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark Cancelled" }));

    await waitFor(() => {
      expect(markBrokerOrderCancelled).toHaveBeenCalledWith("order-1", {
        reason:
          "Marked cancelled from reconciliation because this order no longer appears in broker open orders.",
      });
    });
  });
});
