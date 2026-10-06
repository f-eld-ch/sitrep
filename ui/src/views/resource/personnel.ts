import type { Resource } from "api";

/**
 * Overall personnel number shown on resource KPIs. Only deployed resources count;
 * alerted and ready ones are reported through the per-status tags instead.
 */
export function deployedPersonnel(
  resources: Pick<Resource, "status" | "personnelCount">[],
): number {
  return resources
    .filter((resource) => resource.status === "EINGESETZT")
    .reduce((total, resource) => total + resource.personnelCount, 0);
}
