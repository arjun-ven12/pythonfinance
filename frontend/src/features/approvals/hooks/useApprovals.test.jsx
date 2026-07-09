import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useApprovals from "./useApprovals";

vi.mock("../services/approvalsApi", () => ({
  executeBrokerPaperApproval: vi.fn(),
  getApprovalRequests: vi.fn(),
  previewBrokerPaperExecution: vi.fn(),
  runApprovalAction: vi.fn(),
  updateApprovalRequest: vi.fn(),
}));

import {
  executeBrokerPaperApproval,
  getApprovalRequests,
  previewBrokerPaperExecution,
} from "../services/approvalsApi";

describe("useApprovals broker paper execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovalRequests.mockResolvedValue({ approval_requests: [] });
  });

  it("uses a single manual override confirmation for broker paper execution", async () => {
    previewBrokerPaperExecution
      .mockRejectedValueOnce({
        override_eligible: true,
        block_reason: "Risk budget exceeded.",
      })
      .mockResolvedValueOnce({
        symbol: "AAPL",
        order: {
          side: "BUY",
          quantity: 10,
          orderType: "LIMIT",
          limitPrice: 100,
        },
        marketData: {
          tradingSession: "Regular",
          marketStatus: "Normal",
          tradable: true,
          last: 101,
        },
        preview: {
          estimatedNotional: 1000,
          buyingPowerRemaining: 95000,
          mode: "PAPER_BROKER",
        },
      });
    executeBrokerPaperApproval.mockResolvedValue({
      brokerOrder: { id: "order-1", status: "SUBMITTED" },
    });

    const onBrokerPaperExecuted = vi.fn();
    const { result } = renderHook(() =>
      useApprovals({
        onBrokerPaperExecuted,
        paperBrokerEnabled: true,
        statuses: ["PENDING", "APPROVED", "REJECTED", "SNOOZED", "EXECUTED"],
      })
    );

    let actionPromise;
    act(() => {
      actionPromise = result.current.handleApprovalAction("approval-1", "execute-broker-paper");
    });

    await waitFor(() => {
      expect(result.current.confirmationDialog?.title).toBe("Broker paper execution blocked");
    });

    await act(async () => {
      result.current.confirmDialog();
    });
    await waitFor(() => {
      expect(result.current.confirmationDialog?.title).toBe("Broker paper order preview");
    });

    await act(async () => {
      result.current.confirmDialog();
    });
    await actionPromise;

    expect(previewBrokerPaperExecution).toHaveBeenNthCalledWith(1, "approval-1");
    expect(previewBrokerPaperExecution).toHaveBeenNthCalledWith(2, "approval-1", {
      decisionNote: "Manual override requested. Risk budget exceeded.",
      manualOverride: true,
    });
    expect(executeBrokerPaperApproval).toHaveBeenCalledTimes(1);
    expect(executeBrokerPaperApproval).toHaveBeenCalledWith("approval-1", {
      decisionNote: "Manual override requested. Risk budget exceeded.",
      manualOverride: true,
    });
    expect(onBrokerPaperExecuted).toHaveBeenCalledTimes(1);
  });
});
