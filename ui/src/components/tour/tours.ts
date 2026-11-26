import type { TFunction } from "i18next";
import type { TourStep } from "./Tour";

// The steps of the page tours. Elements are found by their `data-tour` attribute, so restyling a
// page does not break its tour. A step whose element is not on screen (no incident yet, the
// navbar collapsed on a phone, a feature flag off) is skipped.

/** Selector of the element with the given `data-tour` attribute. */
export const anchor = (name: string) => `[data-tour="${name}"]`;

const step = (
  t: TFunction,
  key: string,
  element?: string,
  placement: Pick<TourStep, "side" | "align"> = {},
): TourStep => ({
  element,
  title: t(`tour.${key}.title`),
  description: t(`tour.${key}.description`),
  ...placement,
});

// The incident's sections in the navbar; on a phone they are behind the menu button instead.
const incidentNavigation = (t: TFunction): TourStep[] => [
  step(t, "navIncident", anchor("nav-incident")),
  step(t, "navJournal", anchor("nav-journal")),
  step(t, "navResources", anchor("nav-resources")),
  step(t, "navCasualties", anchor("nav-casualties")),
  step(t, "navMap", anchor("nav-map")),
  step(t, "navBurger", anchor("nav-burger")),
];

export const incidentListTour = (t: TFunction): TourStep[] => [
  step(t, "welcome"),
  step(t, "incidentCreate", anchor("incident-create")),
  step(t, "incidentFilter", anchor("incident-filter")),
  step(t, "incidentCard", anchor("incident-card")),
  step(t, "incidentEnter", anchor("incident-enter")),
  step(t, "navHelp", anchor("nav-help")),
  step(t, "navSettings", anchor("nav-settings"), { align: "end" }),
];

export const dashboardTour = (t: TFunction): TourStep[] => [
  step(t, "dashboardIntro"),
  step(t, "dashboardMessages", anchor("message-stack"), { side: "right" }),
  step(t, "dashboardMap", anchor("dashboard-map"), { side: "left" }),
  step(t, "timeline", anchor("timeline"), { side: "top" }),
  step(t, "dashboardKpis", anchor("dashboard-kpis"), { side: "left" }),
  ...incidentNavigation(t),
];

export const journalMessagesTour = (t: TFunction): TourStep[] => [
  step(t, "journalIntro"),
  step(t, "messageFilters", anchor("message-filters")),
  step(t, "journalMessage", `${anchor("message-list")} > :first-child`, { side: "top" }),
  step(t, "navJournal", anchor("nav-journal")),
];

export const journalEditorTour = (t: TFunction): TourStep[] => [
  step(t, "editorIntro"),
  step(t, "editorMedium", anchor("editor-medium")),
  step(t, "editorForm", anchor("editor-form"), { side: "right" }),
  step(t, "editorList", anchor("message-filters")),
  step(t, "editorPrint", anchor("message-print"), { align: "end" }),
];

export const triageTour = (t: TFunction): TourStep[] => [
  step(t, "triageIntro"),
  step(t, "triageStack", anchor("message-stack"), { side: "right" }),
  step(t, "triageFilters", anchor("message-stack-filters"), { side: "top" }),
  step(t, "triageSteps", anchor("triage-steps")),
  step(t, "triageKeys", anchor("triage-keys"), { align: "end" }),
];

export const mapTour = (t: TFunction): TourStep[] => [
  step(t, "mapIntro"),
  step(t, "mapSearch", anchor("map-search")),
  // Drawn by mapbox-gl-draw, which knows nothing of data-tour: its group holds the polygon tool.
  step(t, "mapDraw", ".mapboxgl-ctrl-group:has(> .mapbox-gl-draw_polygon)", { side: "left" }),
  step(t, "mapLayers", anchor("map-layers"), { side: "left" }),
  step(t, "mapStyle", anchor("map-style"), { side: "left" }),
  step(t, "timeline", anchor("timeline"), { side: "top" }),
];
