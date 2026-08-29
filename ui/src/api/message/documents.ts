import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  GetMessageForTriageQuery,
  GetMessageForTriageQueryVariables,
  GetMessagesQuery,
  GetMessagesQueryVariables,
  InsertMessageMutation,
  InsertMessageMutationVariables,
  SaveMessageTriageMutation,
  SaveMessageTriageMutationVariables,
  UpdateMessageMutation,
  UpdateMessageMutationVariables,
} from "gql";

const GET_MESSAGES: TypedDocumentNode<GetMessagesQuery, GetMessagesQueryVariables> = gql`
  query GetMessages($journalId: uuid!) {
    journalsByPk(id: $journalId) {
      incident {
        id
        divisions {
          id
          name
          description
        }
      }
    }
    messages(
      where: { journal: { id: { _eq: $journalId } }, deletedAt: { _isNull: true } }
      orderBy: { time: DESC }
    ) {
      id
      content
      sender
      receiver
      senderDetail
      receiverDetail
      medium: mediumId
      time
      createdAt
      updatedAt
      deletedAt
      divisions {
        division {
          id
          name
          description
        }
      }
      triageId
      priorityId
    }
  }
`;

const GET_MESSAGE_FOR_TRIAGE: TypedDocumentNode<
  GetMessageForTriageQuery,
  GetMessageForTriageQueryVariables
> = gql`
  query GetMessageForTriage($messageId: uuid!) {
    messagesByPk(id: $messageId) {
      id
      content
      sender
      receiver
      senderDetail
      receiverDetail
      medium: mediumId
      time
      divisions {
        division {
          id
          name
          description
        }
      }
      createdAt
      updatedAt
      deletedAt
      triageId
      priorityId
      journal {
        incident {
          divisions {
            id
            name
            description
          }
        }
      }
    }
  }
`;

const INSERT_MESSAGE: TypedDocumentNode<InsertMessageMutation, InsertMessageMutationVariables> =
  gql`
    mutation InsertMessage(
      $journalId: uuid
      $sender: String
      $receiver: String
      $time: timestamptz
      $content: String
      $receiverDetail: String
      $senderDetail: String
      $medium: MediumEnum
    ) {
      insertMessagesOne(
        object: {
          content: $content
          journalId: $journalId
          receiver: $receiver
          sender: $sender
          time: $time
          mediumId: $medium
          senderDetail: $senderDetail
          receiverDetail: $receiverDetail
        }
      ) {
        id
        createdAt
        content
        receiver
        sender
        senderDetail
        receiverDetail
        medium: mediumId
        time
        updatedAt
        triageId
        priorityId
        divisions {
          division {
            name
          }
        }
        deletedAt
      }
    }
  `;

const UPDATE_MESSAGE: TypedDocumentNode<UpdateMessageMutation, UpdateMessageMutationVariables> =
  gql`
    mutation UpdateMessage(
      $messageId: uuid!
      $content: String
      $sender: String
      $receiver: String
      $time: timestamptz
      $receiverDetail: String
      $senderDetail: String
      $medium: MediumEnum
    ) {
      updateMessagesByPk(
        pkColumns: { id: $messageId }
        _set: {
          content: $content
          sender: $sender
          receiver: $receiver
          time: $time
          mediumId: $medium
          senderDetail: $senderDetail
          receiverDetail: $receiverDetail
        }
      ) {
        id
        createdAt
        content
        receiver
        sender
        senderDetail
        receiverDetail
        medium: mediumId
        time
        updatedAt
        triageId
        priorityId
        divisions {
          division {
            name
          }
        }
        deletedAt
      }
    }
  `;

const SAVE_MESSAGE_TRIAGE: TypedDocumentNode<
  SaveMessageTriageMutation,
  SaveMessageTriageMutationVariables
> = gql`
  mutation SaveMessageTriage(
    $messageId: uuid!
    $priority: PriorityStatusEnum
    $triage: TriageStatusEnum
    $messageDivisions: [MessageDivisionInsertInput!]!
  ) {
    deleteMessageDivision(where: { messageId: { _eq: $messageId } }) {
      affectedRows
    }
    insertMessageDivision(objects: $messageDivisions) {
      affectedRows
    }
    updateMessagesByPk(
      pkColumns: { id: $messageId }
      _set: { priorityId: $priority, triageId: $triage }
    ) {
      id
      divisions {
        division {
          name
        }
      }
      triageId
      priorityId
    }
  }
`;

export {
  GET_MESSAGE_FOR_TRIAGE,
  GET_MESSAGES,
  INSERT_MESSAGE,
  SAVE_MESSAGE_TRIAGE,
  UPDATE_MESSAGE,
};
