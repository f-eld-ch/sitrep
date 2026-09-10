import { Spinner } from "components";
import { Notification } from "components/ui";
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
    return <Notification variant="danger">{t(`errors.${result.error.code}`)}</Notification>;
  }

  if (result.status === "loading") return <Spinner />;

  return (
    <>
      <h3 className="text-3xl font-bold capitalize mb-4">{t("editIncident")}</h3>
      <div className="bg-bg-elevated border border-border rounded p-5 shadow-sm mb-4">
        <IncidentForm incident={result.data.incident} />
      </div>
      {showRbacEditors && incidentId && result.data.incident.canManageAccess && (
        <IncidentAccessSection incidentId={incidentId} />
      )}
    </>
  );
}

export default Editor;
