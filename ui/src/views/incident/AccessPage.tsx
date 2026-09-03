import { useParams } from "react-router";
import IncidentAccessSection from "./Access";

/** Standalone incident access page — reachable by direct URL only, not linked from the navbar. */
function AccessPage() {
  const { incidentId } = useParams();

  if (!incidentId) return null;

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">Incident access</h3>
      <IncidentAccessSection incidentId={incidentId} />
    </>
  );
}

export default AccessPage;
