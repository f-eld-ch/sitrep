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

DELETE FROM features
WHERE layer_id IN (
    SELECT id FROM layers
    WHERE incident_id IN (
        SELECT id FROM incidents WHERE closed_at IS NOT NULL
    )
);

DELETE FROM layers
WHERE incident_id IN (
    SELECT id FROM incidents WHERE closed_at IS NOT NULL
);

DELETE FROM incidents
WHERE closed_at IS NOT NULL;

COMMIT;

BEGIN TRANSACTION;
UPDATE incidents SET closed_at = now()
WHERE closed_at IS NULL AND created_at <= now() - interval '24 hours';
COMMIT;

