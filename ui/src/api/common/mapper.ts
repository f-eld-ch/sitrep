/**
 * Low-level mapper utilities shared by all aggregate mappers.
 *
 * The Hasura GraphQL engine returns Date-typed fields as ISO 8601 strings
 * despite the TypeScript types claiming Date. These helpers centralise the
 * conversion so the defect is fixed in one place when the real DateTime
 * scalar lands.
 */

export function toDate(value: string | Date | null | undefined): Date {
  if (value === null || value === undefined) return new Date(0);
  return new Date(value as string);
}

export function toOptionalDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return new Date(value as string);
}

/**
 * Safe enum coercion with a fallback.
 *
 * Hasura can return enum values that don't yet exist in the client-side enum
 * (e.g. a new status added to the DB before the UI is deployed). Rather than
 * crashing or returning undefined, fall back to the provided default.
 */
export function toEnum<T extends string>(
  values: readonly T[],
  raw: string | null | undefined,
  fallback: T,
): T {
  if (raw !== null && raw !== undefined && (values as readonly string[]).includes(raw)) {
    return raw as T;
  }
  return fallback;
}
