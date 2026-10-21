-- +goose Up
-- HasCasualtyRecords asks "did any message record a non-zero casualty delta for this incident's
-- Schadenplätze". The primary key leads with message_id, so without this index the planner scans the
-- whole table. Partial on non-zero rows: that is all the query looks at, and it keeps the index small.
-- The predicate must stay identical to the one in the query for the planner to use the index.
CREATE INDEX IF NOT EXISTS idx_rm_message_casualties_schadenplatz_nonzero
    ON readmodel.message_casualties (schadenplatz_id)
    WHERE vermisste <> 0 OR tote <> 0 OR verletzte <> 0 OR obdachlose <> 0 OR eingeschlossene <> 0;

-- +goose Down
DROP INDEX IF EXISTS readmodel.idx_rm_message_casualties_schadenplatz_nonzero;
