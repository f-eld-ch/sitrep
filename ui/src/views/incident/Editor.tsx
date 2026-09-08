import { Spinner } from "components";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useIncidentDetails } from "api";
import IncidentAccessSection from "./Access";
import { IncidentForm } from "./New";

function Editor() {
  const { incidentId } = useParams();
  const { t } = useTranslation();
  const showRbacEditors = useBooleanFlagValue("show-rbac-editors", false);

  const result = useIncidentDetails(incidentId);

  if (result.status === "error") {
    return <div className="notification is-danger">{t(`errors.${result.error.code}`)}</div>;
  }

  if (result.status === "loading") return <Spinner />;

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t("editIncident")}</h3>
      <div className="box">
        <IncidentForm incident={result.data.incident} />
      </div>
      {showRbacEditors && incidentId && result.data.incident.canManageAccess && (
        <IncidentAccessSection incidentId={incidentId} />
      )}
    </>
  );
}

export default Editor;
