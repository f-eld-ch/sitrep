import { useQuery } from "@apollo/client";
import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { IncidentDetailsData, IncidentDetailsVars } from "types";
import { GetIncidentDetails } from "./graphql";
import { IncidentForm } from "./New";

function Editor() {
  const { incidentId } = useParams();
  const { t } = useTranslation();

  const { loading, error, data } = useQuery<IncidentDetailsData, IncidentDetailsVars>(GetIncidentDetails, {
    variables: { incidentId: incidentId || "" },
  });

  if (error) return <div className="notification is-danger">{error.message}</div>;

  if (loading) return <Spinner />;

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t('editIncident')}</h3>

      <div className="box">
        <IncidentForm incident={data?.incidentsByPk} />
      </div>
    </>
  );
}

export default Editor;
