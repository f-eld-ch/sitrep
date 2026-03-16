import { useMutation } from "@apollo/client/react";
import { faTag } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import type { InsertJournalData, InsertJournalVars } from "types/journal";
import { GetIncidentDetails } from "views/incident/graphql";
import { GetJournals, InsertJournal } from "./graphql";

function New() {
  const { t } = useTranslation();

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t("createJournal")}</h3>
      <div className="box">
        <NewForm />
      </div>
    </>
  );
}

function NewForm() {
  const { incidentId } = useParams();
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [insertJournal, { error }] = useMutation<InsertJournalData, InsertJournalVars>(
    InsertJournal,
    {
      onCompleted() {
        // reset the form values
        navigate(`../${incidentId}/edit`);
      },
      refetchQueries: [
        { query: GetJournals, variables: { incidentId: incidentId } },
        { query: GetIncidentDetails },
      ],
    },
  );

  const handleSave = () => {
    if (incidentId && name) {
      insertJournal({
        variables: {
          name: name,
          incidentId: incidentId,
        },
      });
    }
  };

  return (
    <>
      {error && <div className="notification is-danger">{error?.message}</div>}

      <div className="field">
        <p className="control has-icons-left has-icons-right">
          <input
            className="input"
            type="text"
            value={name}
            placeholder={t("name") as string}
            onChange={(e) => {
              e.preventDefault();
              setName(e.target.value);
            }}
          />
          <span className="icon is-small is-left">
            <FontAwesomeIcon icon={faTag} />
          </span>
        </p>
      </div>
      <div className="field">
        <p className="control">
          <button
            type="button"
            className="button is-primary is-rounded is-capitalized"
            onClick={handleSave}
          >
            {t("create")}
          </button>
        </p>
      </div>
    </>
  );
}

export default New;
