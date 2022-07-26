import React from "react";
import { useQuery, gql } from "@apollo/client";
import { Link, useParams } from "react-router-dom";

import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import de from "dayjs/locale/de";
import { Spinner } from "components";

dayjs.locale(de);
dayjs.extend(LocalizedFormat);

interface Journal {
  id: string;
  name: string;
  createdAt: string;
  deletedAt: string;
}

interface JournalListData {
  journals: Journal[];
}

interface JournalListVars {
  incidentId: string;
}

const GET_JOURNALS = gql`
  query GetJournals($incidentId: uuid) {
    journals(where: { incident: { id: { _eq: $incidentId } } }) {
      id
      name
      createdAt
      deletedAt
    }
  }
`;

function Overview() {
  const { incidentId } = useParams();

  const { loading, error, data } = useQuery<JournalListData, JournalListVars>(GET_JOURNALS, {
    variables: { incidentId: incidentId || "" },
  });

  if (error) return <div className="notification is-danger">{error.message}</div>;

  if (loading) return <Spinner />;

  return (
    <div>
      <h3 className="title is-size-3">Journale</h3>
      {loading ? (
        <p>Loading ...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Erstellt am</th>
            </tr>
          </thead>
          <tbody>
            {data &&
              data.journals.map((journal) => (
                <tr key={journal.id}>
                  <td>
                    <Link to={`../${journal.id}/edit`}>{journal.name}</Link>
                  </td>
                  <td>{dayjs(journal.createdAt).format("LLL")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Overview;
