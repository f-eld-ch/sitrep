import { createContext } from "react";

/** The message a map is drawn for. Changes take effect at the message's time. */
export interface DrawingMessage {
  id: string;
  time: Date;
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
  /** Free drawing takes effect at this past time instead of now. Never combined with a message. */
  drawAt?: Date;
  setDrawAt?: (drawAt: Date | undefined) => void;
}

export const MapTimeContext = createContext<MapTime>({});
