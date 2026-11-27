import { useTranslation } from "react-i18next";
import type { Layer } from "types/layer";
import { layerLabel } from "utils/divisionLabel";

/**
 * Names the layer a map is showing, and the incident it comes from. `readOnly` says that the
 * layer cannot be drawn on right now (the Nachrichtenkarte, an inherited layer, the past).
 */
export function ActiveLayerCard({
  layer,
  readOnly = false,
  inline = false,
}: {
  layer: Pick<Layer, "name" | "kind" | "sourceIncidentName">;
  readOnly?: boolean;
  /** Take its place in a column of controls, instead of floating in the top-right corner. */
  inline?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={
        inline
          ? "pointer-events-none self-end"
          : "maplibregl-ctrl-top-right pointer-events-none m-2"
      }
    >
      <div className="max-w-64 rounded border border-border bg-bg/95 px-3 py-2 text-sm text-fg shadow-lg backdrop-blur">
        {/* The message map layer is stored with a German fallback name; show the translation. */}
        <p className="truncate font-semibold">{layerLabel(layer, t)}</p>
        {layer.sourceIncidentName && (
          <p className="mt-0.5 truncate text-xs text-fg-muted">{layer.sourceIncidentName}</p>
        )}
        {readOnly && (
          <p className="mt-0.5 truncate text-xs text-fg-muted">
            {t("layerControl.activeLayerReadOnly")}
          </p>
        )}
      </div>
    </div>
  );
}
