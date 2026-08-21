import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_SHA, CURRENT_VERSION, changelogUrl, fetchDeployedVersion } from "./version";

/**
 * `fetchDeployedVersion` runs while the update prompt is being rendered, so a throw would
 * take the prompt down with it — leaving no way to apply the update it was announcing.
 * Every failure path below must resolve to null instead.
 */

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

describe("fetchDeployedVersion", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the deployed build identity", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: "v1.2.3", sha: "abc1234" }));
    await expect(fetchDeployedVersion()).resolves.toEqual({ version: "v1.2.3", sha: "abc1234" });
  });

  it("bypasses the HTTP cache", async () => {
    // Not defensive: a heuristically cached response reports the version this page was
    // served with, which is precisely the bug this module exists to fix.
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: "v1", sha: "a" }));
    await fetchDeployedVersion();
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("requests a path derived from the base URL, not a hard-coded root", async () => {
    // A root-assumed path breaks under a sub-path deployment — the same mistake that made
    // the sprite atlases 404 from a nested route.
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: "v1", sha: "a" }));
    await fetchDeployedVersion();
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url.endsWith("/version")).toBe(true);
    expect(url).not.toContain("//version");
  });

  it.each([
    [
      "the request rejects (offline)",
      () => vi.mocked(fetch).mockRejectedValue(new Error("offline")),
    ],
    [
      "the status is not ok (no such route in dev)",
      () => vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false)),
    ],
    [
      "the body is not JSON",
      () =>
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new SyntaxError("unexpected token")),
        } as unknown as Response),
    ],
    ["the body is JSON null", () => vi.mocked(fetch).mockResolvedValue(jsonResponse(null))],
    [
      "fields are missing",
      () => vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: "v1" })),
    ],
    [
      "fields are the wrong type",
      () => vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 1, sha: 2 })),
    ],
    [
      "fields are empty, as an unversioned build would report",
      () => vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: "", sha: "" })),
    ],
  ])("resolves to null, without throwing, when %s", async (_case, arrange) => {
    arrange();
    await expect(fetchDeployedVersion()).resolves.toBeNull();
  });
});

describe("changelogUrl", () => {
  it("points at the current repository", () => {
    // Was hard-coded as the pre-rename RedGecko/sitrep in two components, working only
    // because GitHub redirects renamed repositories.
    expect(changelogUrl("abc1234")).toBe(
      "https://github.com/f-eld-ch/sitrep/blob/abc1234/CHANGELOG.md",
    );
  });

  it("embeds whichever ref it is given", () => {
    expect(changelogUrl("develop")).toContain("/blob/develop/");
  });
});

describe("build-time constants", () => {
  it("always resolve to something linkable", () => {
    // Both feed straight into a URL and a label, so an empty value would render a broken
    // link rather than an obviously wrong one.
    expect(CURRENT_VERSION).not.toBe("");
    expect(CURRENT_SHA).not.toBe("");
  });
});
