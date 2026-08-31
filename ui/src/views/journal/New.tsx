import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";

/**
 * Journal creation is gone in the v2 API.
 * Redirect to the incident editor.
 */
function New() {
  const { incidentId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/incident/${incidentId}/edit`, { replace: true });
  }, [incidentId, navigate]);

  return null;
}

export default New;
