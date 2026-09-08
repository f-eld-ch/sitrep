import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, isApiError, apiErrorFromApolloError, rethrowAsApiError } from "./errors";

vi.mock("@apollo/client/errors", () => ({
  CombinedGraphQLErrors: { is: vi.fn(() => false) },
  ServerError: { is: vi.fn(() => false) },
}));

import { CombinedGraphQLErrors, ServerError } from "@apollo/client/errors";

const mockCombined = vi.mocked(CombinedGraphQLErrors.is);
const mockServer = vi.mocked(ServerError.is);

beforeEach(() => {
  mockCombined.mockReturnValue(false);
  mockServer.mockReturnValue(false);
});

describe("ApiError", () => {
  it("uses the default message for a known code", () => {
    const e = new ApiError("FORBIDDEN");
    expect(e.code).toBe("FORBIDDEN");
    expect(e.message).toMatch(/permission/i);
    expect(e.name).toBe("ApiError");
  });

  it("uses a custom message when provided", () => {
    const e = new ApiError("NOT_FOUND", "custom msg");
    expect(e.message).toBe("custom msg");
    expect(e.code).toBe("NOT_FOUND");
  });

  it("is an instance of Error", () => {
    expect(new ApiError("UNKNOWN")).toBeInstanceOf(Error);
  });
});

describe("isApiError", () => {
  it("returns true for ApiError instances", () => {
    expect(isApiError(new ApiError("UNKNOWN"))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isApiError(new Error("oops"))).toBe(false);
  });

  it("returns false for null and primitives", () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError("FORBIDDEN")).toBe(false);
  });
});

describe("apiErrorFromApolloError", () => {
  it("returns UNKNOWN for an unrecognised shape", () => {
    const err = apiErrorFromApolloError({ message: "something random" });
    expect(err.code).toBe("UNKNOWN");
  });

  it("extracts known code from CombinedGraphQLErrors with gqlgen prefix", () => {
    mockCombined.mockReturnValue(true);
    const e = Object.assign(new Error("input:2:3: revokeIncidentRole FORBIDDEN"), {
      errors: [
        {
          message: "input:2:3: revokeIncidentRole FORBIDDEN",
          extensions: { code: "FORBIDDEN" },
        },
      ],
    });
    const err = apiErrorFromApolloError(e);
    expect(err.code).toBe("FORBIDDEN");
    // stripped remainder equals the code → falls back to default message
    expect(err.message).toMatch(/permission/i);
  });

  it("uses the server message when it differs from the code after stripping", () => {
    mockCombined.mockReturnValue(true);
    const e = Object.assign(
      new Error("input:2:3: getIncident This incident has already been deleted."),
      {
        errors: [
          {
            message: "input:2:3: getIncident This incident has already been deleted.",
            extensions: { code: "NOT_FOUND" },
          },
        ],
      },
    );
    const err = apiErrorFromApolloError(e);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("This incident has already been deleted.");
  });

  it("falls back to UNKNOWN for an unrecognised error code", () => {
    mockCombined.mockReturnValue(true);
    const e = Object.assign(new Error("input:1:1: someField FUTURE_CODE"), {
      errors: [
        { message: "input:1:1: someField FUTURE_CODE", extensions: { code: "FUTURE_CODE" } },
      ],
    });
    const err = apiErrorFromApolloError(e);
    expect(err.code).toBe("UNKNOWN");
  });

  it("returns NETWORK_ERROR for ServerError", () => {
    mockServer.mockReturnValue(true);
    const err = apiErrorFromApolloError({ message: "Failed to fetch" });
    expect(err.code).toBe("NETWORK_ERROR");
  });
});

describe("rethrowAsApiError", () => {
  it("rethrows an existing ApiError unchanged", () => {
    const original = new ApiError("NOT_FOUND", "original");
    expect(() => rethrowAsApiError(original)).toThrow(original);
  });

  it("converts an error-shaped object and throws ApiError", () => {
    expect(() => rethrowAsApiError({ message: "oops" })).toThrowError(ApiError);
  });

  it("throws UNKNOWN ApiError for null", () => {
    let caught: unknown;
    try {
      rethrowAsApiError(null);
    } catch (e) {
      caught = e;
    }
    expect(isApiError(caught)).toBe(true);
    expect((caught as ApiError).code).toBe("UNKNOWN");
  });

  it("throws UNKNOWN ApiError for a non-object primitive", () => {
    let caught: unknown;
    try {
      rethrowAsApiError(42);
    } catch (e) {
      caught = e;
    }
    expect(isApiError(caught)).toBe(true);
    expect((caught as ApiError).code).toBe("UNKNOWN");
  });
});
