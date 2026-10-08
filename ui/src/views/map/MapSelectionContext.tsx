import { createContext } from "react";

/** How a map reports which feature is selected, and how its host asks it to clear the selection. */
export interface MapSelection {
  /**
   * Called with the id of the feature that is clicked or selected, and with undefined when the
   * selection is cleared. Maps without a listener do not track clicks on features at all.
   */
  onSelect?: (featureId: string | undefined) => void;
  /** Changing this clears the map's own selection (e.g. when the host clears its filter). */
  deselectToken?: number;
  /**
   * Called whenever something is drawn, changed or deleted for the message the map is drawn for
   * (and so saved right away). Lets the host know the message has work in progress.
   */
  onDrawingChange?: () => void;
}

export const MapSelectionContext = createContext<MapSelection>({});
