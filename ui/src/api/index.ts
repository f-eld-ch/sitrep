// Public surface of the anti-corruption layer.
// Components and views import ONLY from this module (via the "api" path alias).
// @apollo/client must never be imported outside src/api/.

export type { ApiError, ApiErrorCode } from "./errors";
export { isApiError } from "./errors";
export type { CommandHook, CommandState, QueryResult } from "./result";
