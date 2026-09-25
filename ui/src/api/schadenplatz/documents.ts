import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CreateSchadenplatzMutation,
  CreateSchadenplatzMutationVariables,
  RecordCasualtiesMutation,
  RecordCasualtiesMutationVariables,
} from "../../gql/next/graphql";

// ── Fragment (unique name to avoid collision with SchadenplatzFields) ─────────

export const SCHADENPLATZ_FRAGMENT2 = gql`
  fragment SchadenplatzFields2 on Schadenplatz {
    id
    incidentId
    name
    isDefault
    isMerged
    mergedInto
    casualties {
      vermisste
      tote
      verletzte
      obdachlose
      eingeschlossene
    }
  }
`;

// ── Mutations ─────────────────────────────────────────────────────────────────

export const CREATE_SCHADENPLATZ: TypedDocumentNode<
  CreateSchadenplatzMutation,
  CreateSchadenplatzMutationVariables
> = gql`
  ${SCHADENPLATZ_FRAGMENT2}
  mutation CreateSchadenplatz($incidentId: ID!, $name: String!, $occurredAt: DateTime) {
    createSchadenplatz(incidentId: $incidentId, name: $name, occurredAt: $occurredAt) {
      ...SchadenplatzFields2
    }
  }
`;

export const RECORD_CASUALTIES: TypedDocumentNode<
  RecordCasualtiesMutation,
  RecordCasualtiesMutationVariables
> = gql`
  mutation RecordCasualties(
    $id: ID!
    $sourceMessageId: ID!
    $occurredAt: DateTime
    $input: CasualtyDeltasInput!
  ) {
    recordCasualties(
      id: $id
      sourceMessageId: $sourceMessageId
      occurredAt: $occurredAt
      input: $input
    ) {
      id
      casualties {
        vermisste
        tote
        verletzte
        obdachlose
        eingeschlossene
      }
    }
  }
`;
