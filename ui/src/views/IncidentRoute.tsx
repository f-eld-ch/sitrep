import { Spinner } from "components";
import { useContext } from "react";
import { Outlet, useParams } from "react-router";
import { IncidentContext } from "utils";
import { useIncidentSync } from "utils/IncidentContext";

export function IncidentRoute() {
  const { incidentId } = useParams();
  const {
    state: { incident, loadedForId },
  } = useContext(IncidentContext);

  useIncidentSync();

  if (loadedForId !== incidentId) {
    return <Spinner />;
  }

  if (incident === null) {
    throw new Response("Not Found", { status: 404 });
  }

  return <Outlet />;
}
