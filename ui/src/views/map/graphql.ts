import { gql } from "@apollo/client";

const GET_LAYERS = gql`
    query GetLayers($incidentId: uuid!) {
        layers(where: {incidentId: {_eq: $incidentId}}) {
            id
            isActive @client
            name
            features {
                id
                geometry
                properties
                createdAt
                updatedAt
                deletedAt
            }
        }
    }
`;

const ADD_FEATURE = gql`
    mutation AddFeature($layerId: uuid!, $id: uuid!, $geometry: jsonb, $properties: jsonb) {
        insertFeaturesOne(object: {layerId: $layerId, id: $id, geometry: $geometry, properties: $properties}) {
            id
            geometry
            properties
            createdAt
            updatedAt
            deletedAt
        }
    }
`;

const MODIFY_FEATURE = gql`
    mutation UpdateFeature($id: uuid!, $geometry: jsonb, $properties: jsonb) {
        updateFeaturesByPk(
            pkColumns: {id: $id}
                _set: {
            geometry: $geometry
            properties: $properties
            }
        ) {
            id
            geometry
            properties
            createdAt
            updatedAt
            deletedAt
        }
    }
`;

const DELETE_FEATURE = gql`
    mutation UpdateFeature($id: uuid!, $deletedAt: timestamptz) {
        updateFeaturesByPk(
            pkColumns: {id: $id}
            _set: {
                deletedAt: $deletedAt
            }
        ) {
            id
            geometry
            properties
            createdAt
            updatedAt
            deletedAt
        }
    }
`;

export {
    GET_LAYERS as GetLayers,
    ADD_FEATURE as AddFeatureToLayer,
    MODIFY_FEATURE as ModifyFeature,
    DELETE_FEATURE as DeleteFeature,
}
