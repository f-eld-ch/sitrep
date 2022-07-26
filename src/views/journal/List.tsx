import React from "react";

import { JournalMessage, Spinner } from "components";
import { useParams } from "react-router-dom";
import { gql, useSubscription } from "@apollo/client";

interface Message {
  id: string;
  content: string;
  sender: string;
  receiver: string;
  time: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  divisions: DivisionList[];
  triage: Triage;
  priority: Priority;
}

interface Triage {
  name: string;
  description: string;
}

interface Priority {
  name: string;
  description: string;
}

interface DivisionList {
  division: Division;
}
interface Division {
  name: string;
  description: string;
}

interface MessageListData {
  messages: Message[];
}

interface MessageListVars {
  journalId: string;
}

const GET_MESSAGES = gql`
  subscription GetMessages($journalId: uuid) {
    messages(where: { journal: { id: { _eq: $journalId } }, deletedAt: { _is_null: true } }, order_by: { time: desc }) {
      id
      content
      sender
      receiver
      time
      createdAt
      updatedAt
      deletedAt
      divisions {
        division {
          name
          description
        }
      }
      triage {
        name
        name
      }
      priority {
        name
      }
    }
  }
`;

function List() {
  const { journalId } = useParams();

  const { loading, error, data } = useSubscription<MessageListData, MessageListVars>(GET_MESSAGES, {
    variables: { journalId: journalId || "" },
  });

  if (error)
    return (
      <div className="notification is-danger is-light">
        <div className="block has-text-weight-semibold">Ups, da ging was schief:</div>
        <div className="block">{error.message}</div>
      </div>
    );

  if (loading) return <Spinner />;

  return (
    <div>
      <h3 className="title is-3">Journal</h3>
      {data &&
        data.messages.map((message) => {
          return (
            <JournalMessage
              key={message.id}
              assignments={message.divisions.map((d) => d.division.name)}
              triage={message.triage.name}
              priority={message.priority.name}
              sender={message.sender}
              receiver={message.receiver}
              message={message.content}
              timeDate={new Date(message.time)}
            />
          );
        })}
    </div>
  );
}

export default List;
