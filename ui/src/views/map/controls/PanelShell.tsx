import type { ReactNode } from "react";

/**
 * The frame of the unified feature panel: under the draw controls at the top right, like the
 * symbol overlay it replaces. `data-feature-panel` is how the map finds it to keep the feature
 * clear of it.
 */
export function PanelShell({
  children,
  testId = "symbol-panel",
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="maplibregl-ctrl-top-right mt-[160px]">
      <div
        className="maplibregl-ctrl max-h-[calc(100vh-240px)] w-[300px] overflow-y-auto rounded bg-white p-3 text-xs text-black shadow-[0_0_0_2px_rgba(0,0,0,0.1)]"
        data-testid={testId}
        data-feature-panel
      >
        {children}
      </div>
    </div>
  );
}
