import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { PageTitle } from "components/ui";
import IncidentAccessSection from "./Access";

/** Standalone incident access page — reachable by direct URL only, not linked from the navbar. */
function AccessPage() {
  const { t } = useTranslation();
  const { incidentId } = useParams();

  if (!incidentId) return null;

  return (
    <>
      <PageTitle>{t("incidentAccess.title")}</PageTitle>
      <IncidentAccessSection incidentId={incidentId} />
    </>
  );
}

export default AccessPage;
