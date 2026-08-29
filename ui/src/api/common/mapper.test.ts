import { describe, expect, it } from "vitest";
import { toDate, toEnum, toOptionalDate } from "./mapper";

describe("toDate", () => {
  it("parses an ISO string to a Date", () => {
    const result = toDate("2024-03-15T10:30:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe("2024-03-15T10:30:00.000Z");
  });

  it("returns epoch for null", () => {
    expect(toDate(null)).toEqual(new Date(0));
  });

  it("returns epoch for undefined", () => {
    expect(toDate(undefined)).toEqual(new Date(0));
  });
});

describe("toOptionalDate", () => {
  it("parses an ISO string to a Date", () => {
    const result = toOptionalDate("2024-03-15T10:30:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe("2024-03-15T10:30:00.000Z");
  });

  it("returns null for null", () => {
    expect(toOptionalDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toOptionalDate(undefined)).toBeNull();
  });
});

describe("toEnum", () => {
  const values = ["ALPHA", "BETA", "GAMMA"] as const;
  type TestEnum = (typeof values)[number];
  const fallback: TestEnum = "ALPHA";

  it("returns the raw value when it exists in the enum", () => {
    expect(toEnum(values, "BETA", fallback)).toBe("BETA");
  });

  it("returns the fallback for an unknown value", () => {
    expect(toEnum(values, "DELTA", fallback)).toBe("ALPHA");
  });

  it("returns the fallback for null", () => {
    expect(toEnum(values, null, fallback)).toBe("ALPHA");
  });

  it("returns the fallback for undefined", () => {
    expect(toEnum(values, undefined, fallback)).toBe("ALPHA");
  });
});
