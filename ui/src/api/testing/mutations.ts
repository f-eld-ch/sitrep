import { InMemoryCache, type ApolloCache } from "@apollo/client";
import { CombinedGraphQLErrors, ServerError } from "@apollo/client/errors";
import { vi } from "vitest";

/** The subset of Apollo's mutate options the command hooks pass, loosely typed for assertions. */
export interface MutateOptions {
  variables?: Record<string, unknown>;
  optimisticResponse?: unknown;
  refetchQueries?: unknown;
  update?: (cache: ApolloCache, result: { data?: unknown }) => void;
}

/**
 * Makes the mocked `useMutation` return a `mutate` spy that resolves to `resolved`
 * (or rejects with `rejection` when given). Returns the spy.
 */
export async function mockMutation(options: { resolved?: unknown; rejection?: unknown } = {}) {
  const { useMutation } = await import("@apollo/client/react");
  const mutate =
    "rejection" in options
      ? vi.fn().mockRejectedValue(options.rejection)
      : vi.fn().mockResolvedValue(options.resolved ?? { data: undefined });
  vi.mocked(useMutation).mockReturnValue([
    mutate,
    { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
  ]);
  return mutate;
}

/** The options of the first `mutate` call. */
export function mutateOptions(mutate: ReturnType<typeof vi.fn>): MutateOptions {
  return mutate.mock.calls[0]![0] as MutateOptions;
}

/** A real cache that tests seed with plain wire literals. */
export function newCache(): InMemoryCache {
  const replace = { merge: false };
  return new InMemoryCache({
    // Lists and objects are replaced wholesale on write, as the hooks intend; saying so keeps
    // Apollo from warning about non-normalized data on every overwrite.
    typePolicies: {
      Query: {
        fields: {
          incidentAccess: replace,
          accessGroups: replace,
          globalRoles: replace,
          groupMembers: replace,
          defaultAccess: replace,
        },
      },
    },
  });
}

/** A real Apollo GraphQL error carrying `extensions.code`, as the server sends it. */
export function graphQlError(code: string, message = "boom"): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({ data: null, errors: [{ message, extensions: { code } }] });
}

/** A real Apollo transport error (non-2xx HTTP response). */
export function serverError(): ServerError {
  return new ServerError("Bad gateway", {
    response: new Response("", { status: 502 }),
    bodyText: "",
  });
}
