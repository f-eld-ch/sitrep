import { useTranslation } from "react-i18next";
import type { Layer } from "types/layer";
import { layerLabel } from "utils/divisionLabel";

/** Names the layer a read-only map is showing, and the incident it comes from. */
export function ActiveLayerCard({
  layer,
}: {
  layer: Pick<Layer, "name" | "kind" | "sourceIncidentName">;
}) {
  const { t } = useTranslation();

  return (
    <div className="maplibregl-ctrl-top-right pointer-events-none m-2">
      <div className="max-w-64 rounded border border-border bg-bg/95 px-3 py-2 text-sm text-fg shadow-lg backdrop-blur">
        {/* The message map layer is stored with a German fallback name; show the translation. */}
        <p className="truncate font-semibold">{layerLabel(layer, t)}</p>
        {layer.sourceIncidentName && (
          <p className="mt-0.5 truncate text-xs text-fg-muted">{layer.sourceIncidentName}</p>
        )}
      </div>
    </div>
  );
}
