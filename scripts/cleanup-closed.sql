BEGIN TRANSACTION;

DELETE FROM divisions
WHERE incident_id IN (
    SELECT id FROM incidents WHERE closed_at IS NOT NULL
);

DELETE FROM messages
WHERE journal_id IN (
    SELECT id FROM journals
    WHERE incident_id IN (
        SELECT id FROM incidents WHERE closed_at IS NOT NULL
    )
);

DELETE FROM journals
WHERE incident_id IN (
    SELECT id FROM incidents WHERE closed_at IS NOT NULL
);


DELETE FROM incidents
WHERE closed_at IS NOT NULL;

COMMIT;
