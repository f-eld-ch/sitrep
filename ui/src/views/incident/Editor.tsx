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
      <h3 className="mb-4 text-3xl font-bold capitalize">{t("editIncident")}</h3>
      <div className="mb-4 rounded border border-border bg-bg-elevated p-5 shadow-sm">
        <IncidentForm incident={result.data.incident} />
      </div>
      {showRbacEditors && incidentId && result.data.incident.canManageAccess && (
        <IncidentAccessSection incidentId={incidentId} />
      )}
    </>
  );
}

export default Editor;
