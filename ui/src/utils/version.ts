/**
 * Build identity, and the changelog links built from it.
 *
 * Single home for these concerns: the repo slug used to be hardcoded in two components,
 * which is how it went stale (it named the pre-rename `RedGecko/sitrep` while the remote is
 * `f-eld-ch/sitrep` — working only because GitHub redirects renamed repositories).
 */

/** The version this bundle was built from. Injected by vite.config.ts at build time. */
export const CURRENT_VERSION: string = import.meta.env.VITE_VERSION || "unknown";

/** The commit this bundle was built from. Injected by vite.config.ts at build time. */
export const CURRENT_SHA: string = import.meta.env.VITE_SHA_VERSION || "main";

const CHANGELOG_REPO = "f-eld-ch/sitrep";

/** Link to CHANGELOG.md as of a given commit or ref. */
export const changelogUrl = (sha: string): string =>
  `https://github.com/${CHANGELOG_REPO}/blob/${sha}/CHANGELOG.md`;

export interface DeployedVersion {
  version: string;
  sha: string;
}

/**
 * Asks the server which build it is currently serving.
 *
 * The constants above describe the bundle that is *running*, so they cannot identify an
 * update — the page has no compiled-in knowledge of a version released after it. The
 * server does: the UI is embedded in the Go binary (`ui.Assets`), so its build identity is
 * also the frontend's.
 *
 * Resolves to `null` rather than throwing on any failure — offline, a dev server without
 * the proxy, a mid-deploy blip, or a malformed body. Callers fall back to the running
 * version, so the update prompt still works when this does not.
 */
export async function fetchDeployedVersion(): Promise<DeployedVersion | null> {
  // Derived from BASE_URL rather than a bare "/version": a root-assumed path breaks under
  // a sub-path deployment, which is exactly how the sprite URLs 404'd in #1739.
  const url = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/version`;

  try {
    // `no-store` is essential, not defensive: a heuristically cached response would report
    // the version this page was served with, which is the bug this exists to fix.
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;

    const { version, sha } = body as Partial<DeployedVersion>;
    // Guard the shape as well as the parse: an unversioned build would answer with empty
    // strings, and naming "" in the prompt is worse than falling back.
    if (typeof version !== "string" || typeof sha !== "string") return null;
    if (version === "" || sha === "") return null;

    return { version, sha };
  } catch {
    return null;
  }
}
