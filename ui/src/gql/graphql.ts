/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
/** input type for inserting array relation for remote table "divisions" */
export type DivisionsArrRelInsertInput = {
  data: Array<DivisionsInsertInput>;
  /** upsert condition */
  onConflict?: DivisionsOnConflict | null | undefined;
};

/** Boolean expression to filter rows from the table "divisions". All fields are combined with a logical 'AND'. */
export type DivisionsBoolExp = {
  _and?: Array<DivisionsBoolExp> | null | undefined;
  _not?: DivisionsBoolExp | null | undefined;
  _or?: Array<DivisionsBoolExp> | null | undefined;
  description?: StringComparisonExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  incident?: IncidentsBoolExp | null | undefined;
  message_divisions?: MessageDivisionBoolExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "divisions" */
export type DivisionsConstraint =
  /** unique or primary key constraint on columns "id" */
  | 'divisions_id_key'
  /** unique or primary key constraint on columns "incident_id", "name" */
  | 'divisions_name_incident_id_key'
  /** unique or primary key constraint on columns "id" */
  | 'divisions_pkey';

/** input type for inserting data into table "divisions" */
export type DivisionsInsertInput = {
  description?: string | null | undefined;
  incident?: IncidentsObjRelInsertInput | null | undefined;
  incidentId?: string | null | undefined;
  message_divisions?: MessageDivisionArrRelInsertInput | null | undefined;
  name?: string | null | undefined;
};

/** input type for inserting object relation for remote table "divisions" */
export type DivisionsObjRelInsertInput = {
  data: DivisionsInsertInput;
  /** upsert condition */
  onConflict?: DivisionsOnConflict | null | undefined;
};

/** on_conflict condition type for table "divisions" */
export type DivisionsOnConflict = {
  constraint: DivisionsConstraint;
  updateColumns?: Array<DivisionsUpdateColumn>;
  where?: DivisionsBoolExp | null | undefined;
};

/** update columns of table "divisions" */
export type DivisionsUpdateColumn =
  /** column name */
  | 'description'
  /** column name */
  | 'name';

/** input type for inserting array relation for remote table "features" */
export type FeaturesArrRelInsertInput = {
  data: Array<FeaturesInsertInput>;
  /** upsert condition */
  onConflict?: FeaturesOnConflict | null | undefined;
};

/** Boolean expression to filter rows from the table "features". All fields are combined with a logical 'AND'. */
export type FeaturesBoolExp = {
  _and?: Array<FeaturesBoolExp> | null | undefined;
  _not?: FeaturesBoolExp | null | undefined;
  _or?: Array<FeaturesBoolExp> | null | undefined;
  createdAt?: TimestamptzComparisonExp | null | undefined;
  deletedAt?: TimestamptzComparisonExp | null | undefined;
  geometry?: JsonbComparisonExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  layer?: LayersBoolExp | null | undefined;
  layerId?: UuidComparisonExp | null | undefined;
  properties?: JsonbComparisonExp | null | undefined;
  updatedAt?: TimestamptzComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "features" */
export type FeaturesConstraint =
  /** unique or primary key constraint on columns "id" */
  | 'features_pkey';

/** input type for inserting data into table "features" */
export type FeaturesInsertInput = {
  createdAt?: Date | string | null | undefined;
  geometry?: Record<string, unknown> | null | undefined;
  id?: string | null | undefined;
  layer?: LayersObjRelInsertInput | null | undefined;
  layerId?: string | null | undefined;
  properties?: Record<string, unknown> | null | undefined;
};

/** on_conflict condition type for table "features" */
export type FeaturesOnConflict = {
  constraint: FeaturesConstraint;
  updateColumns?: Array<FeaturesUpdateColumn>;
  where?: FeaturesBoolExp | null | undefined;
};

/** update columns of table "features" */
export type FeaturesUpdateColumn =
  /** column name */
  | 'deletedAt'
  /** column name */
  | 'geometry'
  /** column name */
  | 'properties'
  /** column name */
  | 'updatedAt';

/** input type for inserting array relation for remote table "incidents" */
export type IncidentsArrRelInsertInput = {
  data: Array<IncidentsInsertInput>;
  /** upsert condition */
  onConflict?: IncidentsOnConflict | null | undefined;
};

/** Boolean expression to filter rows from the table "incidents". All fields are combined with a logical 'AND'. */
export type IncidentsBoolExp = {
  _and?: Array<IncidentsBoolExp> | null | undefined;
  _not?: IncidentsBoolExp | null | undefined;
  _or?: Array<IncidentsBoolExp> | null | undefined;
  closedAt?: TimestamptzComparisonExp | null | undefined;
  createdAt?: TimestamptzComparisonExp | null | undefined;
  deletedAt?: TimestamptzComparisonExp | null | undefined;
  divisions?: DivisionsBoolExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  journals?: JournalsBoolExp | null | undefined;
  layers?: LayersBoolExp | null | undefined;
  location?: LocationsBoolExp | null | undefined;
  locationId?: UuidComparisonExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
  updatedAt?: TimestamptzComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "incidents" */
export type IncidentsConstraint =
  /** unique or primary key constraint on columns "location_id" */
  | 'incidents_location_key'
  /** unique or primary key constraint on columns "id" */
  | 'incidents_pkey';

/** input type for inserting data into table "incidents" */
export type IncidentsInsertInput = {
  divisions?: DivisionsArrRelInsertInput | null | undefined;
  journals?: JournalsArrRelInsertInput | null | undefined;
  layers?: LayersArrRelInsertInput | null | undefined;
  location?: LocationsObjRelInsertInput | null | undefined;
  locationId?: string | null | undefined;
  name?: string | null | undefined;
};

/** input type for inserting object relation for remote table "incidents" */
export type IncidentsObjRelInsertInput = {
  data: IncidentsInsertInput;
  /** upsert condition */
  onConflict?: IncidentsOnConflict | null | undefined;
};

/** on_conflict condition type for table "incidents" */
export type IncidentsOnConflict = {
  constraint: IncidentsConstraint;
  updateColumns?: Array<IncidentsUpdateColumn>;
  where?: IncidentsBoolExp | null | undefined;
};

/** update columns of table "incidents" */
export type IncidentsUpdateColumn =
  /** column name */
  | 'closedAt'
  /** column name */
  | 'deletedAt'
  /** column name */
  | 'locationId'
  /** column name */
  | 'name';

/** input type for inserting array relation for remote table "journals" */
export type JournalsArrRelInsertInput = {
  data: Array<JournalsInsertInput>;
  /** upsert condition */
  onConflict?: JournalsOnConflict | null | undefined;
};

/** Boolean expression to filter rows from the table "journals". All fields are combined with a logical 'AND'. */
export type JournalsBoolExp = {
  _and?: Array<JournalsBoolExp> | null | undefined;
  _not?: JournalsBoolExp | null | undefined;
  _or?: Array<JournalsBoolExp> | null | undefined;
  closedAt?: TimestamptzComparisonExp | null | undefined;
  createdAt?: TimestamptzComparisonExp | null | undefined;
  deletedAt?: TimestamptzComparisonExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  incident?: IncidentsBoolExp | null | undefined;
  incidentId?: UuidComparisonExp | null | undefined;
  messages?: MessagesBoolExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
  updatedAt?: TimestamptzComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "journals" */
export type JournalsConstraint =
  /** unique or primary key constraint on columns "id" */
  | 'journals_pkey';

/** input type for inserting data into table "journals" */
export type JournalsInsertInput = {
  incident?: IncidentsObjRelInsertInput | null | undefined;
  incidentId?: string | null | undefined;
  messages?: MessagesArrRelInsertInput | null | undefined;
  name?: string | null | undefined;
};

/** input type for inserting object relation for remote table "journals" */
export type JournalsObjRelInsertInput = {
  data: JournalsInsertInput;
  /** upsert condition */
  onConflict?: JournalsOnConflict | null | undefined;
};

/** on_conflict condition type for table "journals" */
export type JournalsOnConflict = {
  constraint: JournalsConstraint;
  updateColumns?: Array<JournalsUpdateColumn>;
  where?: JournalsBoolExp | null | undefined;
};

/** update columns of table "journals" */
export type JournalsUpdateColumn =
  /** column name */
  | 'closedAt'
  /** column name */
  | 'deletedAt'
  /** column name */
  | 'name';

export type JsonbCastExp = {
  String?: StringComparisonExp | null | undefined;
};

/** Boolean expression to compare columns of type "jsonb". All fields are combined with logical 'AND'. */
export type JsonbComparisonExp = {
  _cast?: JsonbCastExp | null | undefined;
  /** is the column contained in the given json value */
  _containedIn?: Record<string, unknown> | null | undefined;
  /** does the column contain the given json value at the top level */
  _contains?: Record<string, unknown> | null | undefined;
  _eq?: Record<string, unknown> | null | undefined;
  _gt?: Record<string, unknown> | null | undefined;
  _gte?: Record<string, unknown> | null | undefined;
  /** does the string exist as a top-level key in the column */
  _hasKey?: string | null | undefined;
  /** do all of these strings exist as top-level keys in the column */
  _hasKeysAll?: Array<string> | null | undefined;
  /** do any of these strings exist as top-level keys in the column */
  _hasKeysAny?: Array<string> | null | undefined;
  _in?: Array<Record<string, unknown>> | null | undefined;
  _isNull?: boolean | null | undefined;
  _lt?: Record<string, unknown> | null | undefined;
  _lte?: Record<string, unknown> | null | undefined;
  _neq?: Record<string, unknown> | null | undefined;
  _nin?: Array<Record<string, unknown>> | null | undefined;
};

/** input type for inserting array relation for remote table "layers" */
export type LayersArrRelInsertInput = {
  data: Array<LayersInsertInput>;
  /** upsert condition */
  onConflict?: LayersOnConflict | null | undefined;
};

/** Boolean expression to filter rows from the table "layers". All fields are combined with a logical 'AND'. */
export type LayersBoolExp = {
  _and?: Array<LayersBoolExp> | null | undefined;
  _not?: LayersBoolExp | null | undefined;
  _or?: Array<LayersBoolExp> | null | undefined;
  createdAt?: TimestamptzComparisonExp | null | undefined;
  deletedAt?: TimestamptzComparisonExp | null | undefined;
  features?: FeaturesBoolExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  incident?: IncidentsBoolExp | null | undefined;
  incidentId?: UuidComparisonExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
  updatedAt?: TimestamptzComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "layers" */
export type LayersConstraint =
  /** unique or primary key constraint on columns "incident_id", "name" */
  | 'layers_incident_id_name_key'
  /** unique or primary key constraint on columns "id" */
  | 'layers_pkey';

/** input type for inserting data into table "layers" */
export type LayersInsertInput = {
  createdAt?: Date | string | null | undefined;
  features?: FeaturesArrRelInsertInput | null | undefined;
  id?: string | null | undefined;
  incident?: IncidentsObjRelInsertInput | null | undefined;
  incidentId?: string | null | undefined;
  name?: string | null | undefined;
};

/** input type for inserting object relation for remote table "layers" */
export type LayersObjRelInsertInput = {
  data: LayersInsertInput;
  /** upsert condition */
  onConflict?: LayersOnConflict | null | undefined;
};

/** on_conflict condition type for table "layers" */
export type LayersOnConflict = {
  constraint: LayersConstraint;
  updateColumns?: Array<LayersUpdateColumn>;
  where?: LayersBoolExp | null | undefined;
};

/** update columns of table "layers" */
export type LayersUpdateColumn =
  /** column name */
  | 'deletedAt'
  /** column name */
  | 'name'
  /** column name */
  | 'updatedAt';

/** Boolean expression to filter rows from the table "locations". All fields are combined with a logical 'AND'. */
export type LocationsBoolExp = {
  _and?: Array<LocationsBoolExp> | null | undefined;
  _not?: LocationsBoolExp | null | undefined;
  _or?: Array<LocationsBoolExp> | null | undefined;
  coordinates?: PointComparisonExp | null | undefined;
  createdAt?: TimestamptzComparisonExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  incident?: IncidentsBoolExp | null | undefined;
  incidentById?: IncidentsBoolExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
  updatedAt?: TimestamptzComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "locations" */
export type LocationsConstraint =
  /** unique or primary key constraint on columns "id" */
  | 'locations_pkey';

/** input type for inserting data into table "locations" */
export type LocationsInsertInput = {
  coordinates?: string | null | undefined;
  incident?: IncidentsArrRelInsertInput | null | undefined;
  incidentById?: IncidentsObjRelInsertInput | null | undefined;
  name?: string | null | undefined;
};

/** input type for inserting object relation for remote table "locations" */
export type LocationsObjRelInsertInput = {
  data: LocationsInsertInput;
  /** upsert condition */
  onConflict?: LocationsOnConflict | null | undefined;
};

/** on_conflict condition type for table "locations" */
export type LocationsOnConflict = {
  constraint: LocationsConstraint;
  updateColumns?: Array<LocationsUpdateColumn>;
  where?: LocationsBoolExp | null | undefined;
};

/** update columns of table "locations" */
export type LocationsUpdateColumn =
  /** column name */
  | 'coordinates'
  /** column name */
  | 'name';

/** Boolean expression to filter rows from the table "medium". All fields are combined with a logical 'AND'. */
export type MediumBoolExp = {
  _and?: Array<MediumBoolExp> | null | undefined;
  _not?: MediumBoolExp | null | undefined;
  _or?: Array<MediumBoolExp> | null | undefined;
  description?: StringComparisonExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
};

export type MediumEnum =
  /** email message */
  | 'EMAIL'
  /** Other */
  | 'OTHER'
  /** phone call */
  | 'PHONE'
  /** Radio Communication */
  | 'RADIO';

/** Boolean expression to compare columns of type "MediumEnum". All fields are combined with logical 'AND'. */
export type MediumEnumComparisonExp = {
  _eq?: MediumEnum | null | undefined;
  _in?: Array<MediumEnum> | null | undefined;
  _isNull?: boolean | null | undefined;
  _neq?: MediumEnum | null | undefined;
  _nin?: Array<MediumEnum> | null | undefined;
};

/** input type for inserting array relation for remote table "message_division" */
export type MessageDivisionArrRelInsertInput = {
  data: Array<MessageDivisionInsertInput>;
  /** upsert condition */
  onConflict?: MessageDivisionOnConflict | null | undefined;
};

/** Boolean expression to filter rows from the table "message_division". All fields are combined with a logical 'AND'. */
export type MessageDivisionBoolExp = {
  _and?: Array<MessageDivisionBoolExp> | null | undefined;
  _not?: MessageDivisionBoolExp | null | undefined;
  _or?: Array<MessageDivisionBoolExp> | null | undefined;
  division?: DivisionsBoolExp | null | undefined;
  divisionId?: UuidComparisonExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  message?: MessagesBoolExp | null | undefined;
  messageId?: UuidComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "message_division" */
export type MessageDivisionConstraint =
  /** unique or primary key constraint on columns "id" */
  | 'message_devision_pkey'
  /** unique or primary key constraint on columns "division_id", "message_id" */
  | 'message_division_message_id_division_id_key';

/** input type for inserting data into table "message_division" */
export type MessageDivisionInsertInput = {
  division?: DivisionsObjRelInsertInput | null | undefined;
  divisionId?: string | null | undefined;
  message?: MessagesObjRelInsertInput | null | undefined;
  messageId?: string | null | undefined;
};

/** on_conflict condition type for table "message_division" */
export type MessageDivisionOnConflict = {
  constraint: MessageDivisionConstraint;
  updateColumns?: Array<MessageDivisionUpdateColumn>;
  where?: MessageDivisionBoolExp | null | undefined;
};

/** placeholder for update columns of table "message_division" (current role has no relevant permissions) */
export type MessageDivisionUpdateColumn =
  /** placeholder (do not use) */
  | '_PLACEHOLDER';

/** input type for inserting array relation for remote table "messages" */
export type MessagesArrRelInsertInput = {
  data: Array<MessagesInsertInput>;
  /** upsert condition */
  onConflict?: MessagesOnConflict | null | undefined;
};

/** Boolean expression to filter rows from the table "messages". All fields are combined with a logical 'AND'. */
export type MessagesBoolExp = {
  _and?: Array<MessagesBoolExp> | null | undefined;
  _not?: MessagesBoolExp | null | undefined;
  _or?: Array<MessagesBoolExp> | null | undefined;
  author?: UsersBoolExp | null | undefined;
  content?: StringComparisonExp | null | undefined;
  createdAt?: TimestamptzComparisonExp | null | undefined;
  deletedAt?: TimestamptzComparisonExp | null | undefined;
  divisions?: MessageDivisionBoolExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  journal?: JournalsBoolExp | null | undefined;
  medium?: MediumBoolExp | null | undefined;
  mediumId?: MediumEnumComparisonExp | null | undefined;
  priority?: PriorityStatusBoolExp | null | undefined;
  priorityId?: PriorityStatusEnumComparisonExp | null | undefined;
  receiver?: StringComparisonExp | null | undefined;
  receiverDetail?: StringComparisonExp | null | undefined;
  sender?: StringComparisonExp | null | undefined;
  senderDetail?: StringComparisonExp | null | undefined;
  time?: TimestamptzComparisonExp | null | undefined;
  triage?: TriageStatusBoolExp | null | undefined;
  triageId?: TriageStatusEnumComparisonExp | null | undefined;
  updatedAt?: TimestamptzComparisonExp | null | undefined;
};

/** unique or primary key constraints on table "messages" */
export type MessagesConstraint =
  /** unique or primary key constraint on columns "id" */
  | 'messages_pkey';

/** input type for inserting data into table "messages" */
export type MessagesInsertInput = {
  content?: string | null | undefined;
  divisions?: MessageDivisionArrRelInsertInput | null | undefined;
  journal?: JournalsObjRelInsertInput | null | undefined;
  journalId?: string | null | undefined;
  mediumId?: MediumEnum | null | undefined;
  receiver?: string | null | undefined;
  receiverDetail?: string | null | undefined;
  sender?: string | null | undefined;
  senderDetail?: string | null | undefined;
  time?: Date | string | null | undefined;
};

/** input type for inserting object relation for remote table "messages" */
export type MessagesObjRelInsertInput = {
  data: MessagesInsertInput;
  /** upsert condition */
  onConflict?: MessagesOnConflict | null | undefined;
};

/** on_conflict condition type for table "messages" */
export type MessagesOnConflict = {
  constraint: MessagesConstraint;
  updateColumns?: Array<MessagesUpdateColumn>;
  where?: MessagesBoolExp | null | undefined;
};

/** update columns of table "messages" */
export type MessagesUpdateColumn =
  /** column name */
  | 'content'
  /** column name */
  | 'mediumId'
  /** column name */
  | 'priorityId'
  /** column name */
  | 'receiver'
  /** column name */
  | 'receiverDetail'
  /** column name */
  | 'sender'
  /** column name */
  | 'senderDetail'
  /** column name */
  | 'time'
  /** column name */
  | 'triageId';

/** Boolean expression to compare columns of type "point". All fields are combined with logical 'AND'. */
export type PointComparisonExp = {
  _eq?: string | null | undefined;
  _gt?: string | null | undefined;
  _gte?: string | null | undefined;
  _in?: Array<string> | null | undefined;
  _isNull?: boolean | null | undefined;
  _lt?: string | null | undefined;
  _lte?: string | null | undefined;
  _neq?: string | null | undefined;
  _nin?: Array<string> | null | undefined;
};

/** Boolean expression to filter rows from the table "priority_status". All fields are combined with a logical 'AND'. */
export type PriorityStatusBoolExp = {
  _and?: Array<PriorityStatusBoolExp> | null | undefined;
  _not?: PriorityStatusBoolExp | null | undefined;
  _or?: Array<PriorityStatusBoolExp> | null | undefined;
  description?: StringComparisonExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
};

export type PriorityStatusEnum =
  /** Critical */
  | 'CRITICAL'
  /** High */
  | 'HIGH'
  /** Normal */
  | 'NORMAL';

/** Boolean expression to compare columns of type "PriorityStatusEnum". All fields are combined with logical 'AND'. */
export type PriorityStatusEnumComparisonExp = {
  _eq?: PriorityStatusEnum | null | undefined;
  _in?: Array<PriorityStatusEnum> | null | undefined;
  _isNull?: boolean | null | undefined;
  _neq?: PriorityStatusEnum | null | undefined;
  _nin?: Array<PriorityStatusEnum> | null | undefined;
};

/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
export type StringComparisonExp = {
  _eq?: string | null | undefined;
  _gt?: string | null | undefined;
  _gte?: string | null | undefined;
  /** does the column match the given case-insensitive pattern */
  _ilike?: string | null | undefined;
  _in?: Array<string> | null | undefined;
  /** does the column match the given POSIX regular expression, case insensitive */
  _iregex?: string | null | undefined;
  _isNull?: boolean | null | undefined;
  /** does the column match the given pattern */
  _like?: string | null | undefined;
  _lt?: string | null | undefined;
  _lte?: string | null | undefined;
  _neq?: string | null | undefined;
  /** does the column NOT match the given case-insensitive pattern */
  _nilike?: string | null | undefined;
  _nin?: Array<string> | null | undefined;
  /** does the column NOT match the given POSIX regular expression, case insensitive */
  _niregex?: string | null | undefined;
  /** does the column NOT match the given pattern */
  _nlike?: string | null | undefined;
  /** does the column NOT match the given POSIX regular expression, case sensitive */
  _nregex?: string | null | undefined;
  /** does the column NOT match the given SQL regular expression */
  _nsimilar?: string | null | undefined;
  /** does the column match the given POSIX regular expression, case sensitive */
  _regex?: string | null | undefined;
  /** does the column match the given SQL regular expression */
  _similar?: string | null | undefined;
};

/** Boolean expression to compare columns of type "timestamptz". All fields are combined with logical 'AND'. */
export type TimestamptzComparisonExp = {
  _eq?: Date | string | null | undefined;
  _gt?: Date | string | null | undefined;
  _gte?: Date | string | null | undefined;
  _in?: Array<Date | string> | null | undefined;
  _isNull?: boolean | null | undefined;
  _lt?: Date | string | null | undefined;
  _lte?: Date | string | null | undefined;
  _neq?: Date | string | null | undefined;
  _nin?: Array<Date | string> | null | undefined;
};

/** Boolean expression to filter rows from the table "triage_status". All fields are combined with a logical 'AND'. */
export type TriageStatusBoolExp = {
  _and?: Array<TriageStatusBoolExp> | null | undefined;
  _not?: TriageStatusBoolExp | null | undefined;
  _or?: Array<TriageStatusBoolExp> | null | undefined;
  description?: StringComparisonExp | null | undefined;
  messages?: MessagesBoolExp | null | undefined;
  name?: StringComparisonExp | null | undefined;
};

export type TriageStatusEnum =
  /** Triage is done */
  | 'DONE'
  /** Needs more information */
  | 'MOREINFO'
  /** Triage is pending */
  | 'PENDING'
  /** Triage is reset and needs to be redone */
  | 'RESET';

/** Boolean expression to compare columns of type "TriageStatusEnum". All fields are combined with logical 'AND'. */
export type TriageStatusEnumComparisonExp = {
  _eq?: TriageStatusEnum | null | undefined;
  _in?: Array<TriageStatusEnum> | null | undefined;
  _isNull?: boolean | null | undefined;
  _neq?: TriageStatusEnum | null | undefined;
  _nin?: Array<TriageStatusEnum> | null | undefined;
};

/** Boolean expression to filter rows from the table "users". All fields are combined with a logical 'AND'. */
export type UsersBoolExp = {
  _and?: Array<UsersBoolExp> | null | undefined;
  _not?: UsersBoolExp | null | undefined;
  _or?: Array<UsersBoolExp> | null | undefined;
  email?: StringComparisonExp | null | undefined;
  id?: UuidComparisonExp | null | undefined;
  messages?: MessagesBoolExp | null | undefined;
  sub?: StringComparisonExp | null | undefined;
};

/** Boolean expression to compare columns of type "uuid". All fields are combined with logical 'AND'. */
export type UuidComparisonExp = {
  _eq?: string | null | undefined;
  _gt?: string | null | undefined;
  _gte?: string | null | undefined;
  _in?: Array<string> | null | undefined;
  _isNull?: boolean | null | undefined;
  _lt?: string | null | undefined;
  _lte?: string | null | undefined;
  _neq?: string | null | undefined;
  _nin?: Array<string> | null | undefined;
};

export type FetchIncidentsQueryVariables = Exact<{ [key: string]: never; }>;


export type FetchIncidentsQuery = { incidents: Array<{ id: string, name: string, createdAt: string, updatedAt: string, deletedAt: string | null, closedAt: string | null, location: { name: string | null, coordinates: string | null } }> };

export type GetIncidentDetailQueryVariables = Exact<{
  incidentId: string;
}>;


export type GetIncidentDetailQuery = { incidentsByPk: { id: string, name: string, createdAt: string, closedAt: string | null, updatedAt: string, location: { id: string, name: string | null, coordinates: string | null }, divisions: Array<{ id: string, name: string, description: string | null }>, journals: Array<{ id: string, name: string }> } | null };

export type InsertIncidentMutationVariables = Exact<{
  name: string;
  location?: string | null | undefined;
  divisions: Array<DivisionsInsertInput> | DivisionsInsertInput;
  journalName?: string | null | undefined;
  layerName?: string | null | undefined;
}>;


export type InsertIncidentMutation = { insertIncidentsOne: { id: string, name: string, journals: Array<{ id: string, name: string }>, divisions: Array<{ name: string, id: string, description: string | null }>, layers: Array<{ name: string, id: string }> } | null };

export type UpdateIncidentMutationVariables = Exact<{
  incidentId: string;
  name: string;
  location: string;
  locationId: string;
  divisions: Array<DivisionsInsertInput> | DivisionsInsertInput;
}>;


export type UpdateIncidentMutation = { updateLocationsByPk: { id: string, name: string | null } | null, insertDivisions: { affectedRows: number } | null, updateIncidentsByPk: { id: string, name: string, journals: Array<{ id: string, name: string }>, divisions: Array<{ name: string, id: string, description: string | null }> } | null };

export type CloseIncidentMutationVariables = Exact<{
  incidentId?: string | null | undefined;
  closedAt?: Date | string | null | undefined;
}>;


export type CloseIncidentMutation = { updateJournals: { affectedRows: number, returning: Array<{ id: string, closedAt: string | null }> } | null, updateIncidents: { affectedRows: number, returning: Array<{ id: string, closedAt: string | null }> } | null };

export type DeleteIncidentMutationVariables = Exact<{
  incidentId?: string | null | undefined;
  deletedAt?: Date | string | null | undefined;
}>;


export type DeleteIncidentMutation = { updateJournals: { affectedRows: number, returning: Array<{ id: string, deletedAt: string | null }> } | null, updateIncidents: { affectedRows: number, returning: Array<{ id: string, deletedAt: string | null }> } | null };

export type GetJournalsQueryVariables = Exact<{
  incidentId?: string | null | undefined;
}>;


export type GetJournalsQuery = { incidents: Array<{ id: string, name: string, journals: Array<{ id: string, name: string, createdAt: string, updatedAt: string, closedAt: string | null, deletedAt: string | null }> }> };

export type InsertJournalMutationVariables = Exact<{
  name: string;
  incidentId: string;
}>;


export type InsertJournalMutation = { insertJournalsOne: { id: string, name: string, createdAt: string, updatedAt: string, closedAt: string | null, deletedAt: string | null } | null };

export type CloseJournalMutationVariables = Exact<{
  journalId?: string | null | undefined;
  closedAt?: Date | string | null | undefined;
}>;


export type CloseJournalMutation = { updateJournals: { affectedRows: number, returning: Array<{ id: string, closedAt: string | null }> } | null };

export type GetLayersQueryVariables = Exact<{
  incidentId: string;
}>;


export type GetLayersQuery = { layers: Array<{ id: string, name: string, features: Array<{ id: string, geometry: Record<string, unknown>, properties: Record<string, unknown>, createdAt: string, updatedAt: string | null, deletedAt: string | null }> }> };

export type AddFeatureMutationVariables = Exact<{
  layerId: string;
  id: string;
  geometry?: Record<string, unknown> | null | undefined;
  properties?: Record<string, unknown> | null | undefined;
}>;


export type AddFeatureMutation = { insertFeaturesOne: { id: string, geometry: Record<string, unknown>, properties: Record<string, unknown>, createdAt: string, updatedAt: string | null, deletedAt: string | null } | null };

export type UpdateFeatureMutationVariables = Exact<{
  id: string;
  geometry?: Record<string, unknown> | null | undefined;
  properties?: Record<string, unknown> | null | undefined;
}>;


export type UpdateFeatureMutation = { updateFeaturesByPk: { id: string, geometry: Record<string, unknown>, properties: Record<string, unknown>, createdAt: string, updatedAt: string | null, deletedAt: string | null } | null };

export type DeleteFeatureMutationVariables = Exact<{
  id: string;
  deletedAt?: Date | string | null | undefined;
}>;


export type DeleteFeatureMutation = { updateFeaturesByPk: { id: string, geometry: Record<string, unknown>, properties: Record<string, unknown>, createdAt: string, updatedAt: string | null, deletedAt: string | null } | null };

export type AddLayerMutationVariables = Exact<{
  incidentId: string;
  name: string;
}>;


export type AddLayerMutation = { insertLayersOne: { id: string } | null };

export type GetMessagesQueryVariables = Exact<{
  journalId: string;
}>;


export type GetMessagesQuery = { journalsByPk: { incident: { id: string, divisions: Array<{ id: string, name: string, description: string | null }> } } | null, messages: Array<{ id: string, content: string, sender: string, receiver: string, senderDetail: string | null, receiverDetail: string | null, time: string, createdAt: string, updatedAt: string, deletedAt: string | null, triageId: TriageStatusEnum, priorityId: PriorityStatusEnum | null, medium: MediumEnum | null, divisions: Array<{ division: { id: string, name: string, description: string | null } }> }> };

export type GetMessageForTriageQueryVariables = Exact<{
  messageId: string;
}>;


export type GetMessageForTriageQuery = { messagesByPk: { id: string, content: string, sender: string, receiver: string, senderDetail: string | null, receiverDetail: string | null, time: string, createdAt: string, updatedAt: string, deletedAt: string | null, triageId: TriageStatusEnum, priorityId: PriorityStatusEnum | null, medium: MediumEnum | null, divisions: Array<{ division: { id: string, name: string, description: string | null } }>, journal: { incident: { divisions: Array<{ id: string, name: string, description: string | null }> } } | null } | null };

export type InsertMessageMutationVariables = Exact<{
  journalId?: string | null | undefined;
  sender?: string | null | undefined;
  receiver?: string | null | undefined;
  time?: Date | string | null | undefined;
  content?: string | null | undefined;
  receiverDetail?: string | null | undefined;
  senderDetail?: string | null | undefined;
  medium?: MediumEnum | null | undefined;
}>;


export type InsertMessageMutation = { insertMessagesOne: { id: string, createdAt: string, content: string, receiver: string, sender: string, senderDetail: string | null, receiverDetail: string | null, time: string, updatedAt: string, triageId: TriageStatusEnum, priorityId: PriorityStatusEnum | null, deletedAt: string | null, medium: MediumEnum | null, divisions: Array<{ division: { name: string } }> } | null };

export type UpdateMessageMutationVariables = Exact<{
  messageId: string;
  content?: string | null | undefined;
  sender?: string | null | undefined;
  receiver?: string | null | undefined;
  time?: Date | string | null | undefined;
  receiverDetail?: string | null | undefined;
  senderDetail?: string | null | undefined;
  medium?: MediumEnum | null | undefined;
}>;


export type UpdateMessageMutation = { updateMessagesByPk: { id: string, createdAt: string, content: string, receiver: string, sender: string, senderDetail: string | null, receiverDetail: string | null, time: string, updatedAt: string, triageId: TriageStatusEnum, priorityId: PriorityStatusEnum | null, deletedAt: string | null, medium: MediumEnum | null, divisions: Array<{ division: { name: string } }> } | null };

export type SaveMessageTriageMutationVariables = Exact<{
  messageId: string;
  priority?: PriorityStatusEnum | null | undefined;
  triage?: TriageStatusEnum | null | undefined;
  messageDivisions: Array<MessageDivisionInsertInput> | MessageDivisionInsertInput;
}>;


export type SaveMessageTriageMutation = { deleteMessageDivision: { affectedRows: number } | null, insertMessageDivision: { affectedRows: number } | null, updateMessagesByPk: { id: string, triageId: TriageStatusEnum, priorityId: PriorityStatusEnum | null, divisions: Array<{ division: { name: string } }> } | null };


export const FetchIncidentsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FetchIncidents"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"incidents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"createdAt"},"value":{"kind":"EnumValue","value":"DESC"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_isNull"},"value":{"kind":"BooleanValue","value":true}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"closedAt"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}}]} as unknown as DocumentNode<FetchIncidentsQuery, FetchIncidentsQueryVariables>;
export const GetIncidentDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetIncidentDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"incidentsByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"closedAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}},{"kind":"Field","name":{"kind":"Name","value":"journals"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<GetIncidentDetailQuery, GetIncidentDetailQueryVariables>;
export const InsertIncidentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InsertIncident"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"location"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"divisions"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DivisionsInsertInput"}}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"journalName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"layerName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insertIncidentsOne"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"location"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"data"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"location"}}}]}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"journals"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"data"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"journalName"}}}]}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"layers"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"data"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"layerName"}}}]}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"divisions"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"data"},"value":{"kind":"Variable","name":{"kind":"Name","value":"divisions"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"journals"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}},{"kind":"Field","name":{"kind":"Name","value":"layers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]} as unknown as DocumentNode<InsertIncidentMutation, InsertIncidentMutationVariables>;
export const UpdateIncidentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateIncident"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"location"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"locationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"divisions"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DivisionsInsertInput"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateLocationsByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pkColumns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"locationId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"location"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"insertDivisions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objects"},"value":{"kind":"Variable","name":{"kind":"Name","value":"divisions"}}},{"kind":"Argument","name":{"kind":"Name","value":"onConflict"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"constraint"},"value":{"kind":"EnumValue","value":"divisions_name_incident_id_key"}},{"kind":"ObjectField","name":{"kind":"Name","value":"updateColumns"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"description"},{"kind":"EnumValue","value":"name"}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}}]}},{"kind":"Field","name":{"kind":"Name","value":"updateIncidentsByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pkColumns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"journals"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]}}]} as unknown as DocumentNode<UpdateIncidentMutation, UpdateIncidentMutationVariables>;
export const CloseIncidentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CloseIncident"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"closedAt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"timestamptz"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateJournals"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"incident"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}]}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"closedAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_isNull"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"closedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"closedAt"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}},{"kind":"Field","name":{"kind":"Name","value":"returning"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"closedAt"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"updateIncidents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"closedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"closedAt"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}},{"kind":"Field","name":{"kind":"Name","value":"returning"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"closedAt"}}]}}]}}]}}]} as unknown as DocumentNode<CloseIncidentMutation, CloseIncidentMutationVariables>;
export const DeleteIncidentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteIncident"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"deletedAt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"timestamptz"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateJournals"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"incident"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}]}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"deletedAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_isNull"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"deletedAt"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}},{"kind":"Field","name":{"kind":"Name","value":"returning"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"updateIncidents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"deletedAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_isNull"},"value":{"kind":"BooleanValue","value":true}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"closedAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_isNull"},"value":{"kind":"BooleanValue","value":false}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"deletedAt"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}},{"kind":"Field","name":{"kind":"Name","value":"returning"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]}}]} as unknown as DocumentNode<DeleteIncidentMutation, DeleteIncidentMutationVariables>;
export const GetJournalsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetJournals"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"incidents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"journals"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"createdAt"},"value":{"kind":"EnumValue","value":"ASC"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"closedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]}}]} as unknown as DocumentNode<GetJournalsQuery, GetJournalsQueryVariables>;
export const InsertJournalDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InsertJournal"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insertJournalsOne"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"incidentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"closedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]} as unknown as DocumentNode<InsertJournalMutation, InsertJournalMutationVariables>;
export const CloseJournalDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CloseJournal"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"journalId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"closedAt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"timestamptz"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateJournals"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"journalId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"closedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"closedAt"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}},{"kind":"Field","name":{"kind":"Name","value":"returning"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"closedAt"}}]}}]}}]}}]} as unknown as DocumentNode<CloseJournalMutation, CloseJournalMutationVariables>;
export const GetLayersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetLayers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"layers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"incidentId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"features"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"properties"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]}}]} as unknown as DocumentNode<GetLayersQuery, GetLayersQueryVariables>;
export const AddFeatureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddFeature"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"layerId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"geometry"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"jsonb"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"properties"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"jsonb"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insertFeaturesOne"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"layerId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"layerId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"geometry"},"value":{"kind":"Variable","name":{"kind":"Name","value":"geometry"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"properties"},"value":{"kind":"Variable","name":{"kind":"Name","value":"properties"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"properties"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]} as unknown as DocumentNode<AddFeatureMutation, AddFeatureMutationVariables>;
export const UpdateFeatureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateFeature"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"geometry"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"jsonb"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"properties"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"jsonb"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateFeaturesByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pkColumns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"geometry"},"value":{"kind":"Variable","name":{"kind":"Name","value":"geometry"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"properties"},"value":{"kind":"Variable","name":{"kind":"Name","value":"properties"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"properties"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateFeatureMutation, UpdateFeatureMutationVariables>;
export const DeleteFeatureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteFeature"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"deletedAt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"timestamptz"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateFeaturesByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pkColumns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"deletedAt"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"properties"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]} as unknown as DocumentNode<DeleteFeatureMutation, DeleteFeatureMutationVariables>;
export const AddLayerDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddLayer"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insertLayersOne"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"incidentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"incidentId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddLayerMutation, AddLayerMutationVariables>;
export const GetMessagesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMessages"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"journalId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"journalsByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"journalId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"incident"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"messages"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"journal"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"journalId"}}}]}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"deletedAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_isNull"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"time"},"value":{"kind":"EnumValue","value":"DESC"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"sender"}},{"kind":"Field","name":{"kind":"Name","value":"receiver"}},{"kind":"Field","name":{"kind":"Name","value":"senderDetail"}},{"kind":"Field","name":{"kind":"Name","value":"receiverDetail"}},{"kind":"Field","alias":{"kind":"Name","value":"medium"},"name":{"kind":"Name","value":"mediumId"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"division"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"triageId"}},{"kind":"Field","name":{"kind":"Name","value":"priorityId"}}]}}]}}]} as unknown as DocumentNode<GetMessagesQuery, GetMessagesQueryVariables>;
export const GetMessageForTriageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMessageForTriage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"messagesByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"sender"}},{"kind":"Field","name":{"kind":"Name","value":"receiver"}},{"kind":"Field","name":{"kind":"Name","value":"senderDetail"}},{"kind":"Field","name":{"kind":"Name","value":"receiverDetail"}},{"kind":"Field","alias":{"kind":"Name","value":"medium"},"name":{"kind":"Name","value":"mediumId"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"division"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"triageId"}},{"kind":"Field","name":{"kind":"Name","value":"priorityId"}},{"kind":"Field","name":{"kind":"Name","value":"journal"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"incident"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetMessageForTriageQuery, GetMessageForTriageQueryVariables>;
export const InsertMessageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InsertMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"journalId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sender"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"receiver"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"time"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"timestamptz"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"content"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"receiverDetail"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"senderDetail"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"medium"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"MediumEnum"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insertMessagesOne"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"content"},"value":{"kind":"Variable","name":{"kind":"Name","value":"content"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"journalId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"journalId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"receiver"},"value":{"kind":"Variable","name":{"kind":"Name","value":"receiver"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"sender"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sender"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"time"},"value":{"kind":"Variable","name":{"kind":"Name","value":"time"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"mediumId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"medium"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"senderDetail"},"value":{"kind":"Variable","name":{"kind":"Name","value":"senderDetail"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"receiverDetail"},"value":{"kind":"Variable","name":{"kind":"Name","value":"receiverDetail"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"receiver"}},{"kind":"Field","name":{"kind":"Name","value":"sender"}},{"kind":"Field","name":{"kind":"Name","value":"senderDetail"}},{"kind":"Field","name":{"kind":"Name","value":"receiverDetail"}},{"kind":"Field","alias":{"kind":"Name","value":"medium"},"name":{"kind":"Name","value":"mediumId"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"triageId"}},{"kind":"Field","name":{"kind":"Name","value":"priorityId"}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"division"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]} as unknown as DocumentNode<InsertMessageMutation, InsertMessageMutationVariables>;
export const UpdateMessageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"content"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sender"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"receiver"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"time"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"timestamptz"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"receiverDetail"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"senderDetail"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"medium"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"MediumEnum"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateMessagesByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pkColumns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"content"},"value":{"kind":"Variable","name":{"kind":"Name","value":"content"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"sender"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sender"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"receiver"},"value":{"kind":"Variable","name":{"kind":"Name","value":"receiver"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"time"},"value":{"kind":"Variable","name":{"kind":"Name","value":"time"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"mediumId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"medium"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"senderDetail"},"value":{"kind":"Variable","name":{"kind":"Name","value":"senderDetail"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"receiverDetail"},"value":{"kind":"Variable","name":{"kind":"Name","value":"receiverDetail"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"receiver"}},{"kind":"Field","name":{"kind":"Name","value":"sender"}},{"kind":"Field","name":{"kind":"Name","value":"senderDetail"}},{"kind":"Field","name":{"kind":"Name","value":"receiverDetail"}},{"kind":"Field","alias":{"kind":"Name","value":"medium"},"name":{"kind":"Name","value":"mediumId"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"triageId"}},{"kind":"Field","name":{"kind":"Name","value":"priorityId"}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"division"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateMessageMutation, UpdateMessageMutationVariables>;
export const SaveMessageTriageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SaveMessageTriage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"priority"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"PriorityStatusEnum"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"triage"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"TriageStatusEnum"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"messageDivisions"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"MessageDivisionInsertInput"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteMessageDivision"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"messageId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}}]}},{"kind":"Field","name":{"kind":"Name","value":"insertMessageDivision"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objects"},"value":{"kind":"Variable","name":{"kind":"Name","value":"messageDivisions"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affectedRows"}}]}},{"kind":"Field","name":{"kind":"Name","value":"updateMessagesByPk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pkColumns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"priorityId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"priority"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"triageId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"triage"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"divisions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"division"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"triageId"}},{"kind":"Field","name":{"kind":"Name","value":"priorityId"}}]}}]}}]} as unknown as DocumentNode<SaveMessageTriageMutation, SaveMessageTriageMutationVariables>;