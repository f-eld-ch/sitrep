import { useQuery } from "@apollo/client/react";
import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { GetIncidentDetails } from "./graphql";
import { IncidentForm } from "./New";

function Editor() {
  const { incidentId } = useParams();
  const { t } = useTranslation();

  const { loading, error, data } = useQuery(GetIncidentDetails, {
    variables: { incidentId: incidentId || "" },
  });

  if (error)
    return <div className="notification is-danger">{error.message}</div>;

  if (loading) return <Spinner />;

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t("editIncident")}</h3>

      <div className="box">
        <IncidentForm incident={data?.incidentsByPk} />
      </div>
    </>
  );
}

export default Editor;
