import { registerBabsIcons } from "@f-eld-ch/babs-react";
import { useEffect, useState } from "react";

/**
 * Lazily registers the BABS icon catalogue with `@f-eld-ch/babs-react`.
 *
 * The catalogue is large — the inline SVG definitions are several MB — and the package's
 * `exports` map offers no per-icon entry point, only the `all`/`icons`/`named` barrels.
 * So it is loaded through a dynamic `import()` and must stay in a chunk of its own: if it
 * is grouped with an eagerly-imported package such as `babs-core`, the whole chunk is
 * pulled into the initial load. See the `babs-catalogue` group in vite.config.ts.
 *
 * Registration is global and idempotent, tracked at module scope so remounting the picker
 * neither re-imports nor re-registers.
 *
 * Returns whether the catalogue is ready. `<BabsIcon>` renders its `fallback` until then,
 * so callers should hold off drawing the grid to avoid a flash of placeholders.
 */

let ready = false;
let pending: Promise<void> | undefined;

function loadCatalogue(): Promise<void> {
  pending ??= import("@f-eld-ch/babs-react/all").then((module) => {
    registerBabsIcons(module.default);
    ready = true;
  });
  return pending;
}

export function useBabsIcons(): boolean {
  const [loaded, setLoaded] = useState(ready);

  useEffect(() => {
    // No early return for the already-loaded case: `loadCatalogue` hands back the memoised
    // promise, so an already-resolved catalogue simply settles on the next microtask. The
    // initial state above already covers the render before that, and routing every path
    // through the promise keeps the effect to a single shape.
    let active = true;
    void loadCatalogue().then(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return loaded;
}
