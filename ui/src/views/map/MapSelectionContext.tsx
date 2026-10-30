import { createContext } from "react";

/** How a map reports which feature is selected, and how its host asks it to clear the selection. */
export interface MapSelection {
  /**
   * Called with the id of the feature that is clicked or selected, and with undefined when the
   * selection is cleared. Maps without a listener do not track clicks on features at all.
   *
   * `sourceIncidentId` is the incident the feature's layer belongs to. A parent incident shows
   * the layers of its sub-incidents, so that is where the feature's messages are, not
   * necessarily in the incident being viewed.
   */
  onSelect?: (featureId: string | undefined, sourceIncidentId?: string) => void;
  /** Changing this clears the map's own selection (e.g. when the host clears its filter). */
  deselectToken?: number;
  /**
   * Called whenever something is drawn, changed or deleted for the message the map is drawn for
   * (and so saved right away). Lets the host know the message has work in progress.
   */
  onDrawingChange?: () => void;
}

export const MapSelectionContext = createContext<MapSelection>({});
