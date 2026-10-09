import { createContext } from "react";

/** The message a map is drawn for. Changes take effect at the message's time. */
export interface DrawingMessage {
  id: string;
  time: Date;
  /**
   * Show the map but do not offer to draw: no draw controls, layer control or symbol pickers.
   * Used for a message that is already drawn, so nothing is changed by accident.
   */
  locked?: boolean;
}

/** Where on the incident timeline the map is, and what a drawing gesture belongs to. */
export interface MapTime {
  /**
   * Show the map as of this point on the incident timeline instead of its current state.
   * Undefined means live. A map showing the past cannot be drawn on, except for a message.
   */
  asOf?: Date;
  /** Moves the map along the timeline; undefined returns to live. Absent when the map has no timeline. */
  setAsOf?: (asOf: Date | undefined) => void;
  /**
   * Set on the Nachrichtenkarte operator's map: all drawing goes to the message map layer
   * and is connected to this message. Unset on the free map, where the message map layer
   * is read-only.
   */
  drawingMessage?: DrawingMessage;
}

export const MapTimeContext = createContext<MapTime>({});
