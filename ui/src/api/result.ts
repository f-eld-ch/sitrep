import type { ApiError } from "./errors";

/**
 * Narrowed query result — replaces Apollo's ApolloQueryResult at the call site.
 *
 * status "loading" encodes the loading && !data case (initial load).
 * status "error"   means there is a real error; data may still be stale.
 * status "ready"   means data is present; may be background-refreshing.
 *
 * isRefreshing distinguishes a background poll from the initial spinner.
 */
export type QueryResult<T> =
  | { status: "loading"; data: undefined; error: undefined; isRefreshing: false; refresh: () => void }
  | { status: "error"; data: T | undefined; error: ApiError; isRefreshing: boolean; refresh: () => void }
  | { status: "ready"; data: T; error: undefined; isRefreshing: boolean; refresh: () => void };

export interface CommandState {
  loading: boolean;
  error: ApiError | undefined;
}

/**
 * Standard shape for a mutation hook.
 *
 * Promise-returning so callers can await and act on the result inline
 * (e.g. navigate after createIncident) without configuring onCompleted callbacks.
 */
export type CommandHook<Args, Result = void> = [(args: Args) => Promise<Result>, CommandState];
