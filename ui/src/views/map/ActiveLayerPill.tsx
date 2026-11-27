import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import type { Layer } from "types/layer";
import { layerLabel } from "utils/divisionLabel";
import { layerIcon } from "./controls/ActiveLayersControl";

/**
 * The active layer on one line, next to the layers button: its icon and name, and a lock when it
 * cannot be drawn on right now (the Nachrichtenkarte, an inherited layer, the past).
 */
export function ActiveLayerPill({ layer, readOnly }: { layer: Layer; readOnly: boolean }) {
  const { t } = useTranslation();
  const { incidentId } = useParams();
  const icon = layerIcon(layer, layer.sourceIncidentId !== incidentId, layer.id);
  const note = readOnly ? t("layerControl.activeLayerReadOnly") : undefined;

  return (
    <div
      title={note}
      className="pointer-events-none flex max-w-48 items-center gap-1.5 rounded border border-border bg-bg/95 px-2 py-1 text-xs text-fg shadow backdrop-blur"
    >
      <FontAwesomeIcon icon={icon} className="shrink-0 text-fg-muted" />
      <span className="truncate font-semibold">{layerLabel(layer, t)}</span>
      {readOnly && <FontAwesomeIcon icon={faLock} className="shrink-0 text-fg-muted" />}
    </div>
  );
}
