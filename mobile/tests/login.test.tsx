import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import Login from "../src/screens/Login";
import { api, useSession } from "../src/auth/session";
it("login uses the existing native auth bridge and stores only the returned safe user in shared state", async () => {
  const user = {
    id: "u",
    name: "Test",
    email: "test@example.invalid",
    role: "LEVEL_1_USER",
    verificationStatus: "VERIFIED",
  };
  const login = jest.spyOn(api, "login").mockResolvedValue(user);
  useSession.setState({ user: null, online: true });
  await render(<Login />);
  await fireEvent.changeText(
    screen.getByLabelText("Email"),
    "test@example.invalid",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Password"),
    "test-only-password",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Sign in to your workspace" }),
  );
  await waitFor(() =>
    expect(login).toHaveBeenCalledWith(
      "test@example.invalid",
      "test-only-password",
    ),
  );
  expect(useSession.getState().user?.id).toBe("u");
  expect(screen.getByLabelText("Password").props.value).toBe("");
  login.mockRestore();
});
