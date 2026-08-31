import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";

/**
 * Journal concept is gone in the v2 API — every incident has one implicit log.
 * Redirect immediately to the message editor so old links and the incident list
 * still work without a dead "select a journal" screen.
 */
function Overview() {
  const { incidentId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/incident/${incidentId}/journal/edit`, { replace: true });
  }, [incidentId, navigate]);

  return null;
}

export default Overview;
