import { useQuery } from "@apollo/client";
import { Spinner } from "components";
import { useParams } from "react-router-dom";
import { IncidentDetailsData, IncidentDetailsVars } from "types";
import { GET_INCIDENT_DETAILS } from "./Dashboard";
import { IncidentForm } from "./New";

function Editor() {
  const { incidentId } = useParams();

  const { loading, error, data } = useQuery<IncidentDetailsData, IncidentDetailsVars>(GET_INCIDENT_DETAILS, {
    variables: { incidentId: incidentId || "" },
  });

  if (error) return <div className="notification is-danger">{error.message}</div>;

  if (loading) return <Spinner />;

  return (
    <>
      <h3 className="title is-size-3">Ereignis bearbeiten</h3>

      <IncidentForm incident={data?.incidents_by_pk} />
    </>
  );
}

export default Editor;
