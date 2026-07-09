import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LandingPageView from "../../landing/LandingPage";
import AccountStatusPage from "./AccountStatusPage";

describe("demo entry points", () => {
  it("shows a visible View demo CTA on the landing page", () => {
    const onDemo = vi.fn();
    render(
      <LandingPageView
        onDemo={onDemo}
        onLogin={vi.fn()}
        onRegister={vi.fn()}
        onThemeToggle={vi.fn()}
        theme="dark"
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /view demo/i })[0]);
    expect(onDemo).toHaveBeenCalled();
  });

  it("lets pending users open the demo while waiting for verification", () => {
    const onViewDemo = vi.fn();
    render(
      <AccountStatusPage
        onLogout={vi.fn()}
        onViewDemo={onViewDemo}
        status="PENDING_VERIFICATION"
        user={{ email: "pending@example.com" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /view guided demo/i }));
    expect(onViewDemo).toHaveBeenCalled();
  });
});
