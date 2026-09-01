import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useIncidentDetails } from "api";
import { IncidentForm } from "./New";

function Editor() {
  const { incidentId } = useParams();
  const { t } = useTranslation();

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
    </>
  );
}

export default Editor;
