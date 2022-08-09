import { gql, useMutation } from "@apollo/client";
import { faTag } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { InsertJournalData, InsertJournalVars } from "types/journal";
import { GET_JOURNALS } from "./Overview";

function New() {
  return (
    <>
      <h3 className="title is-size-3">Neues Journal erstellen</h3>
      <div className="box">
        <NewForm />
      </div>
    </>
  );
}

export const INSERT_JOURNAL = gql`
  mutation InsertJournal($name: String!, $incidentId: uuid!) {
    insert_journals_one(object: { incidentId: $incidentId, name: $name }) {
      id
      name
      createdAt
      updatedAt
      closedAt
      deletedAt
    }
  }
`;

function NewForm() {
  const { incidentId } = useParams();
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const [insertJournal, { error }] = useMutation<InsertJournalData, InsertJournalVars>(INSERT_JOURNAL, {
    onCompleted(data) {
      // reset the form values
      navigate(`../${data.insert_journals_one.id}/edit`);
    },
    refetchQueries: [{ query: GET_JOURNALS, variables: { incidentId: incidentId } }],
  });

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
      {error ? <div className="notification is-danger">{error?.message}</div> : <></>}

      <div className="field">
        <p className="control has-icons-left has-icons-right">
          <input
            className="input"
            type="text"
            value={name}
            placeholder="Journal-Name"
            onChange={(e) => {
              e.preventDefault();
              setName(e.currentTarget.value);
            }}
          />
          <span className="icon is-small is-left">
            <FontAwesomeIcon icon={faTag} />
          </span>
        </p>
      </div>
      <div className="field">
        <p className="control">
          <button className="button is-primary is-rounded" onClick={handleSave}>
            Erstellen
          </button>
        </p>
      </div>
    </>
  );
}

export default New;
