import React from "react";
import { Alert } from "react-native";
import {
  render,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { useSession, api } from "../src/auth/session";
import Automation from "../src/screens/Automation";
const mockSnapshot = {
  control: {
    mode: "PAPER_AUTONOMOUS",
    status: "ACTIVE",
    accountId: "INTERNAL_PAPER",
    generation: 3,
    lastReconciledAt: new Date().toISOString(),
    policy: {},
    snapshot: {},
  },
  events: [],
  intents: [],
  deploymentLiveEnabled: false,
};
jest.mock("../src/hooks/usePortfolio", () => ({
  useExecution: () => ({ data: mockSnapshot, error: null }),
}));
jest.mock("../src/api/query", () => ({
  useResource: () => ({ data: {}, error: null }),
  refreshAll: jest.fn(async () => {}),
}));
beforeEach(() => {
  useSession.setState({
    user: {
      id: "u",
      name: "Operator",
      email: "operator@example.invalid",
      role: "LEVEL_3_OWNER_ADMIN",
      verificationStatus: "VERIFIED",
      pageAccess: { BROKER: true },
    },
    online: true,
  });
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === "Emergency stop")?.onPress?.();
  });
});
afterEach(() => jest.restoreAllMocks());
it("unknown stop remains visible after transport failure; never claims acknowledgement", async () => {
  jest.spyOn(api, "request").mockRejectedValue(Error("Offline"));
  await render(<Automation />);
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Emergency stop — server confirmation required",
    }),
  );
  await waitFor(() =>
    expect(screen.getByText("Stop request not confirmed")).toBeTruthy(),
  );
  expect(screen.queryByText(/Server acknowledged/)).toBeNull();
});
it("shows authoritative acknowledgement only after a persisted SUSPENDED response", async () => {
  jest
    .spyOn(api, "request")
    .mockResolvedValue({ control: { status: "SUSPENDED", generation: 4 } });
  await render(<Automation />);
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Emergency stop — server confirmation required",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByText("Server acknowledged SUSPENDED · generation 4"),
    ).toBeTruthy(),
  );
});
it("disables owner controls for an ordinary user and offline device", async () => {
  useSession.setState({
    user: {
      id: "u",
      name: "Reader",
      email: "reader@example.invalid",
      role: "LEVEL_1_USER",
      verificationStatus: "VERIFIED",
      pageAccess: { BROKER: true },
    },
    online: false,
  });
  await render(<Automation />);
  expect(
    screen.getByRole("button", {
      name: "Emergency stop — server confirmation required",
    }),
  ).toBeDisabled();
  expect(screen.getByText(/Offline · saved view/)).toBeTruthy();
});
