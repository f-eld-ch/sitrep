/**
 * The name to show for a Schadenplatz. The default one only means "not assigned to a place", so it
 * is shown as the incident itself; named ones keep their name.
 */
export function schadenplatzLabel(
  sp: { isDefault: boolean; name: string },
  incidentName: string | undefined,
  fallback: string,
): string {
  return sp.isDefault ? incidentName || fallback : sp.name;
}
