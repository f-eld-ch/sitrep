import { describe, expect, it } from "vitest";

// Callers (views) tell errors apart with isApiError, which a raw Apollo error fails: it ends up as
// an UNKNOWN error and loses the server's code. So every mutation a command hook awaits has to
// pass its rejection through rethrowAsApiError. This guard reads the sources and checks each call.
const sources = import.meta.glob("./*/commands.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The text after every `await mutate…(…)` call, up to the end of the call chain's first link. */
function callTails(source: string): string[] {
  const tails: string[] = [];

  for (const match of source.matchAll(/await (mutate\w*)\(/g)) {
    let depth = 0;
    let index = match.index + match[0].length - 1;

    for (; index < source.length; index++) {
      if (source[index] === "(") depth++;
      if (source[index] === ")" && --depth === 0) break;
    }

    tails.push(source.slice(index + 1, index + 1 + 32).replace(/\s+/g, ""));
  }

  return tails;
}

describe("command hooks", () => {
  it("finds the command files", () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.entries(sources))(
    "%s converts every rejected mutation to an ApiError",
    (_file, source) => {
      const tails = callTails(source);

      expect(tails.length).toBeGreaterThan(0);
      expect(tails.filter((tail) => !/^\.catch\(rethrowAsApiError[,)]/.test(tail))).toEqual([]);
    },
  );
});
