import { describe, expect, it } from "vitest";
import { formatINR, parseAmountToPaise, percent, sumPaise } from "@/lib/money";
import { parseIndianDate, previousPeriod, resolveRange } from "@/lib/dates";

describe("parseAmountToPaise", () => {
  it.each([
    ["1,23,456.78", 12345678],
    ["1234.5", 123450],
    ["₹ 500", 50000],
    ["Rs. 10,000.00", 1000000],
    ["(1,000.00)", -100000],
    ["-200", -20000],
    ["500.00 Dr", -50000],
    ["500.00 Cr", 50000],
    ["0.75", 75],
    ["12,77,984.92", 127798492],
  ])("%s → %d paise", (input, expected) => {
    expect(parseAmountToPaise(input)).toBe(expected);
  });

  it.each(["", "-", "NA", "abc", "1.234"])("returns null for %j", (input) => {
    expect(parseAmountToPaise(input)).toBeNull();
  });

  it("avoids floating point artefacts for spreadsheet numbers", () => {
    expect(parseAmountToPaise(0.1 + 0.2)).toBe(30);
    expect(parseAmountToPaise(1234.565)).toBe(123457);
  });

  it("sums exactly where floats would drift", () => {
    const values = Array.from({ length: 1000 }, () => parseAmountToPaise("0.10")!);
    expect(sumPaise(values)).toBe(10000);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(formatINR(-5000)).toBe("-₹50.00");
    expect(formatINR(1000000000, { compact: true })).toBe("₹1Cr");
    expect(formatINR(25000000, { compact: true })).toBe("₹2.5L");
  });
  it("computes percentages from integers", () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBeNull();
  });
});

describe("parseIndianDate", () => {
  it.each([
    ["27 Jul 2026", "2026-07-27"],
    ["28-OCT-2025", "2025-10-28"],
    ["04/07/2026", "2026-07-04"],
    ["04-07-26", "2026-07-04"],
    ["2026-07-04", "2026-07-04"],
    ["1 Jan 2026", "2026-01-01"],
    ["04.07.2026", "2026-07-04"],
  ])("%s → %s (day first)", (input, expected) => {
    expect(parseIndianDate(input)).toBe(expected);
  });
  it.each(["31/02/2026", "13/13/2026", "not-a-date", "31/13/26"])("rejects %s", (input) => {
    expect(parseIndianDate(input)).toBeNull();
  });
  it("converts Excel serials", () => {
    expect(parseIndianDate(46023)).toBe("2026-01-01");
  });
});

describe("date ranges", () => {
  const today = "2026-10-25";
  it("resolves presets", () => {
    expect(resolveRange("this-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveRange("last-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolveRange("last-3-months", today)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
    expect(resolveRange("last-6-months", today)).toEqual({ from: "2026-05-01", to: "2026-10-31" });
    expect(resolveRange("this-year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolveRange("custom", today, { from: "2026-03-10", to: "2026-03-01" })).toEqual({ from: "2026-03-01", to: "2026-03-10" });
  });
  it("computes the comparable previous period", () => {
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousPeriod({ from: "2026-08-01", to: "2026-10-31" })).toEqual({ from: "2026-05-01", to: "2026-07-31" });
    expect(previousPeriod({ from: "2026-03-10", to: "2026-03-19" })).toEqual({ from: "2026-02-28", to: "2026-03-09" });
  });
});
