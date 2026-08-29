import type { ApiError } from "../errors";
import type { QueryResult } from "../result";

export function readyResult<T>(data: T): QueryResult<T> {
  return { status: "ready", data, error: undefined, isRefreshing: false, refresh: () => {} };
}

export function loadingResult<T>(): QueryResult<T> {
  return {
    status: "loading",
    data: undefined,
    error: undefined,
    isRefreshing: false,
    refresh: () => {},
  };
}

export function errorResult<T>(error: ApiError, data?: T): QueryResult<T> {
  return { status: "error", data, error, isRefreshing: false, refresh: () => {} };
}
