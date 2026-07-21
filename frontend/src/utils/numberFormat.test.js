import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatNumericValue,
  formatPercent,
} from "./numberFormat";

describe("numberFormat", () => {
  it("keeps whole values whole and rounds fractional values to two places", () => {
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(12.5)).toBe("12.50");
    expect(formatNumber(12.345)).toBe("12.35");
  });

  it("formats numeric AI evidence strings without changing prose", () => {
    expect(formatNumericValue("74.126")).toBe("74.13");
    expect(formatNumericValue("Sharpe improved to 1.234")).toBe("Sharpe improved to 1.234");
  });

  it("supports percent and currency display without changing source precision", () => {
    expect(formatPercent(0.12345, { scale: 100 })).toBe("12.35%");
    expect(formatCurrency(100, "USD")).toBe("USD 100");
    expect(formatCurrency(100.5, "USD")).toBe("USD 100.50");
  });
});
