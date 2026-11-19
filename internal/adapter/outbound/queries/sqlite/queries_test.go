package sqlite_test

import (
	"context"
	"database/sql"
	"maps"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/google/uuid"
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite/projection"
	sqqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
	sqlitemig "github.com/f-eld-ch/sitrep/migrations/sqlite"
)

// ids of the seeded data. The incident P has the children C (restricted, owned by bob) and
// E (open); D is deleted.
var (
	incP = uuid.MustParse("00000000-0000-0000-0000-0000000000a1")
	incC = uuid.MustParse("00000000-0000-0000-0000-0000000000a2")
	incE = uuid.MustParse("00000000-0000-0000-0000-0000000000a3")
	incD = uuid.MustParse("00000000-0000-0000-0000-0000000000a4")

	divLage = uuid.MustParse("00000000-0000-0000-0000-0000000000b1")
	divGone = uuid.MustParse("00000000-0000-0000-0000-0000000000b2")

	msg1 = uuid.MustParse("00000000-0000-0000-0000-0000000000c1")
	msg2 = uuid.MustParse("00000000-0000-0000-0000-0000000000c2")

	att1 = uuid.MustParse("00000000-0000-0000-0000-0000000000d1")
	att2 = uuid.MustParse("00000000-0000-0000-0000-0000000000d2")

	layerP = uuid.MustParse("00000000-0000-0000-0000-0000000000e1")
	layerC = uuid.MustParse("00000000-0000-0000-0000-0000000000e2")
	layerE = uuid.MustParse("00000000-0000-0000-0000-0000000000e3")
	layerX = uuid.MustParse("00000000-0000-0000-0000-0000000000e4")

	featP = uuid.MustParse("00000000-0000-0000-0000-0000000000f1")
	featC = uuid.MustParse("00000000-0000-0000-0000-0000000000f2")
	featE = uuid.MustParse("00000000-0000-0000-0000-0000000000f3")

	spDefault = uuid.MustParse("00000000-0000-0000-0000-000000000a01")
	spOther   = uuid.MustParse("00000000-0000-0000-0000-000000000a02")
	spMerged  = uuid.MustParse("00000000-0000-0000-0000-000000000a03")

	resActive = uuid.MustParse("00000000-0000-0000-0000-000000000a11")
	resOld    = uuid.MustParse("00000000-0000-0000-0000-000000000a12")
	resBare   = uuid.MustParse("00000000-0000-0000-0000-000000000a13")
)

type env struct {
	t    *testing.T
	read *sql.DB
	proj *projection.Projector
	base time.Time

	open *sqqueries.Queries // no access checks
	acl  *sqqueries.Queries // checks the actor in the context
}

func (e *env) as(sub string) context.Context {
	return identity.WithActor(e.t.Context(), identity.Actor{Sub: sub})
}

// apply runs one event through the handler of the read model.
func (e *env) apply(handler, streamType string, id uuid.UUID, version int, eventType string, minutes int, data any) {
	e.t.Helper()

	ev := eventsourcing.Event{
		StreamType: streamType, StreamID: id, Version: version, EventType: eventType, Data: data,
		OccurredAt: e.base.Add(time.Duration(minutes) * time.Minute),
		Metadata:   map[string]any{"actor": "seed"},
	}
	ev.RecordedAt = ev.OccurredAt

	require.NoError(e.t, e.proj.ApplySingle(e.t.Context(), handler, ev), "%s.%s", streamType, eventType)
}

func newEnv(t *testing.T) *env {
	t.Helper()

	path := filepath.Join(t.TempDir(), "test.db")
	pragmas := "&_pragma=journal_mode(WAL)&_pragma=busy_timeout(10000)&_pragma=foreign_keys(1)"

	write, err := sql.Open("sqlite", "file:"+path+"?_txlock=immediate"+pragmas)
	require.NoError(t, err)
	write.SetMaxOpenConns(1)

	read, err := sql.Open("sqlite", "file:"+path+"?_pragma=query_only(1)"+pragmas)
	require.NoError(t, err)
	read.SetMaxOpenConns(4)

	t.Cleanup(func() {
		_ = read.Close()
		_ = write.Close()
	})

	provider, err := goose.NewProvider(goose.DialectSQLite3, write, sqlitemig.FS,
		goose.WithGoMigrations(sqlitemig.GoMigrations()...))
	require.NoError(t, err)

	_, err = provider.Up(t.Context())
	require.NoError(t, err)

	handlers := []projection.Handler{
		projection.NewIncidentHandler(write),
		projection.NewIncidentDivisionHandler(write),
		projection.NewMessageHandler(write),
		projection.NewLayerFeaturesHandler(write),
		projection.NewAccessHandler(write),
		projection.NewSchadenplatzHandler(write),
		projection.NewResourceHandler(write),
	}
	store := sqstore.NewEventStore(read, write, sqstore.WallClock{})
	proj := projection.NewProjector(read, write, store, sqstore.NewNotifier(), handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	return &env{
		t: t, read: read, proj: proj,
		base: time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC),
		open: sqqueries.NewQueries(read),
		acl:  sqqueries.NewQueries(read, sqstore.NewIncidentAccessChecker(read)),
	}
}

func (e *env) seedIncidents() {
	e.t.Helper()

	const h = "readmodel.incident"

	e.apply(h, "Incident", incP, 1, "Opened", 0, map[string]any{
		"name": "Parent", "location": map[string]any{"name": "Bern", "coordinates": []float64{7.44, 46.95}},
	})
	e.apply(h, "Incident", incC, 1, "Opened", 1, map[string]any{"name": "Child restricted", "location": nil})
	e.apply(h, "Incident", incE, 1, "Opened", 2, map[string]any{"name": "Child open", "location": nil})
	e.apply(h, "Incident", incD, 1, "Opened", 3, map[string]any{"name": "Deleted", "location": nil})
	e.apply(h, "Incident", incC, 2, "ParentLinked", 4, map[string]any{"parentId": incP})
	e.apply(h, "Incident", incE, 2, "ParentLinked", 5, map[string]any{"parentId": incP})
	e.apply(h, "Incident", incD, 2, "ParentLinked", 6, map[string]any{"parentId": incP})
	e.apply(h, "Incident", incD, 3, "Deleted", 7, map[string]any{})

	const d = "readmodel.incident_division"

	e.apply(d, "Incident", incP, 1, "DivisionAdded", 8, map[string]any{
		"division": map[string]any{"id": divLage, "name": "Lage", "description": "situation", "kind": ""},
	})
	e.apply(d, "Incident", incP, 2, "DivisionAdded", 9, map[string]any{
		"division": map[string]any{"id": divGone, "name": "Abgang", "description": "", "kind": "MESSAGE_MAP"},
	})
	e.apply(d, "Incident", incP, 3, "DivisionRemoved", 10, map[string]any{"id": divGone})

	const a = "readmodel.access"

	alice, bob := "sub|alice", "sub|bob"
	e.apply(a, "IncidentAccess", incP, 1, "AccessInitialized", 0,
		access.AccessInitialized{Mode: access.Restricted, OwnerSub: &alice})
	e.apply(a, "IncidentAccess", incC, 1, "AccessInitialized", 0,
		access.AccessInitialized{Mode: access.Restricted, OwnerSub: &bob})
	e.apply(a, "IncidentAccess", incE, 1, "AccessInitialized", 0,
		access.AccessInitialized{Mode: access.OpenOperational})
}

func (e *env) seedMessages() {
	e.t.Helper()

	const h = "readmodel.message"

	e.apply(h, "Message", msg1, 1, "Recorded", 20, map[string]any{
		"incidentId": incP, "number": 1, "content": "first", "sender": "S", "receiver": "R", "medium": "radio",
		"time": "2026-03-01T09:00:00Z", "authorSub": "sub|alice",
	})
	e.apply(h, "Message", msg2, 1, "Recorded", 21, map[string]any{
		"incidentId": incP, "number": 2, "content": "second", "sender": "S", "receiver": "R", "medium": "phone",
		"time": "2026-03-01T11:00:00Z", "authorSub": "sub|bob",
	})
	e.apply(h, "Message", msg2, 2, "Triaged", 22, map[string]any{
		"triage": "DONE", "priority": "HIGH", "divisionIds": []uuid.UUID{divLage},
		"linkedResourceIds": []uuid.UUID{resActive}, "triagedBy": "sub|alice",
	})
	e.apply(h, "Message", msg2, 3, "DivisionAcknowledged", 23, map[string]any{"divisionId": divLage, "by": "sub|bob"})

	for i, id := range []uuid.UUID{att1, att2} {
		e.apply(h, "Message", msg1, 2+i, "AttachmentAdded", 24+i, map[string]any{
			"attachmentId": id, "filename": []string{"a.png", "b.pdf"}[i], "contentType": "application/octet-stream",
			"size": 10 * (i + 1), "checksum": "sum", "storageKey": "incidents/" + incP.String() + "/" + id.String(),
			"uploaderSub": "sub|alice",
		})
	}
}

func (e *env) seedLayers() {
	e.t.Helper()

	const h = "readmodel.layer_features"

	for _, l := range []struct {
		id   uuid.UUID
		inc  uuid.UUID
		name string
	}{{layerP, incP, "B Own"}, {layerC, incC, "Restricted layer"}, {layerE, incE, "Open layer"}, {layerX, incP, "A Removed"}} {
		e.apply(h, "Layer", l.id, 1, "Created", 30, map[string]any{"incidentId": l.inc, "name": l.name, "kind": ""})
	}

	e.apply(h, "Layer", layerX, 2, "Removed", 31, map[string]any{})

	place := func(feat, layer, inc uuid.UUID, minutes int, msg *uuid.UUID) {
		data := map[string]any{
			"incidentId": inc,
			"layerId":    layer,
			"geometry": map[string]any{
				"type":        "Point",
				"coordinates": []float64{8, 47},
			},
			"properties":  map[string]any{},
			"effectiveAt": e.base.Add(time.Duration(minutes) * time.Minute),
		}
		if msg != nil {
			data["messageId"] = *msg
		}

		e.apply(h, "Feature", feat, 1, "Placed", minutes, data)
	}

	m1, m2 := msg1, msg2
	place(featP, layerP, incP, 40, &m1)
	place(featC, layerC, incC, 41, nil)
	place(featE, layerE, incE, 42, nil)

	e.apply(h, "Feature", featP, 2, "Moved", 50, map[string]any{
		"geometry":    map[string]any{"type": "Point", "coordinates": []float64{9, 48}},
		"effectiveAt": e.base.Add(50 * time.Minute), "messageId": m2,
	})
}

func (e *env) seedAll() {
	e.seedIncidents()
	e.seedMessages()
	e.seedLayers()
}

func TestQueries_Incidents(t *testing.T) {
	e := newEnv(t)
	e.seedIncidents()

	t.Run("ListIncidents returns live incidents newest first with their active divisions", func(t *testing.T) {
		list, err := e.open.ListIncidents(t.Context())
		require.NoError(t, err)
		require.Len(t, list, 3, "the deleted incident is left out")
		assert.Equal(t, []string{"Child open", "Child restricted", "Parent"},
			[]string{list[0].Name, list[1].Name, list[2].Name})

		parent := list[2]
		require.NotNil(t, parent.Location)
		assert.Equal(t, "Bern", parent.Location.Name)
		require.NotNil(t, parent.Location.Coordinates)
		assert.InDelta(t, 7.44, parent.Location.Coordinates[0], 1e-9)
		assert.Nil(t, list[0].Location)
		require.NotNil(t, list[0].ParentID)
		assert.Equal(t, incP, *list[0].ParentID)
		assert.Nil(t, parent.ParentID)

		require.Len(t, parent.Divisions, 2)
		assert.Equal(t, "Abgang", parent.Divisions[0].Name, "divisions are ordered by name")
		assert.NotNil(t, parent.Divisions[0].RemovedAt, "a removed division is flagged")
		assert.Equal(t, "MESSAGE_MAP", parent.Divisions[0].Kind)
		assert.Equal(t, "Lage", parent.Divisions[1].Name)
		assert.Equal(t, "situation", parent.Divisions[1].Description)
		assert.Nil(t, parent.Divisions[1].RemovedAt)
	})

	t.Run("ListIncidents hides restricted incidents from users without a grant", func(t *testing.T) {
		list, err := e.acl.ListIncidents(e.as("sub|alice"))
		require.NoError(t, err)
		assert.Equal(t, []string{"Child open", "Parent"}, []string{list[0].Name, list[1].Name})
		assert.Len(t, list, 2)

		list, err = e.acl.ListIncidents(e.as("sub|bob"))
		require.NoError(t, err)
		assert.Equal(t, []string{"Child open", "Child restricted"}, []string{list[0].Name, list[1].Name})
		assert.Len(t, list, 2)

		list, err = e.acl.ListIncidents(e.as("sub|carol"))
		require.NoError(t, err)
		require.Len(t, list, 1, "an unrelated user only sees the open incident")
		assert.Equal(t, "Child open", list[0].Name)
	})

	t.Run("access-checked queries need an actor", func(t *testing.T) {
		_, err := e.acl.ListIncidents(t.Context())
		require.ErrorIs(t, err, identity.ErrUnauthenticated)

		_, err = e.acl.GetIncident(t.Context(), incP)
		require.ErrorIs(t, err, identity.ErrUnauthenticated)

		_, err = e.acl.ListReviewSummaries(t.Context())
		require.ErrorIs(t, err, identity.ErrUnauthenticated)

		_, err = e.acl.ListChildIncidents(t.Context(), incP)
		require.ErrorIs(t, err, shared.ErrNotFound, "without an actor nothing can be read")
	})

	t.Run("GetIncident", func(t *testing.T) {
		got, err := e.open.GetIncident(t.Context(), incP)
		require.NoError(t, err)
		assert.Equal(t, "Parent", got.Name)
		assert.Len(t, got.Divisions, 2)
		assert.False(t, got.IsClosed)

		_, err = e.open.GetIncident(t.Context(), incD)
		require.ErrorIs(t, err, shared.ErrNotFound, "a deleted incident is gone")

		_, err = e.open.GetIncident(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = e.acl.GetIncident(e.as("sub|alice"), incC)
		require.ErrorIs(t, err, shared.ErrNotFound, "a restricted incident is not found for users without access")

		got, err = e.acl.GetIncident(e.as("sub|bob"), incC)
		require.NoError(t, err)
		assert.Equal(t, "Child restricted", got.Name)
	})

	t.Run("ListChildIncidents", func(t *testing.T) {
		children, err := e.open.ListChildIncidents(t.Context(), incP)
		require.NoError(t, err)
		require.Len(t, children, 2, "deleted children are left out")
		assert.Equal(t, "Child open", children[0].Name, "newest first")
		assert.Equal(t, "Child restricted", children[1].Name)

		children, err = e.acl.ListChildIncidents(e.as("sub|alice"), incP)
		require.NoError(t, err)
		require.Len(t, children, 1, "the child alice cannot read is left out")
		assert.Equal(t, "Child open", children[0].Name)

		_, err = e.acl.ListChildIncidents(e.as("sub|bob"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound, "bob cannot read the parent")

		none, err := e.open.ListChildIncidents(t.Context(), incC)
		require.NoError(t, err)
		assert.Empty(t, none)
	})
}

func TestQueries_ReviewSummaries(t *testing.T) {
	e := newEnv(t)
	e.seedIncidents()

	const h = "readmodel.incident"

	e.apply(h, "Incident", incP, 10, "Closed", 60, map[string]any{"reason": "MANUAL"})
	e.apply(h, "Incident", incC, 10, "Closed", 61, map[string]any{"reason": "MANUAL"})
	e.apply(h, "Incident", incE, 10, "Closed", 62, map[string]any{"reason": "MANUAL"})
	e.apply(h, "Incident", incP, 11, "ReviewSummarised", 63, map[string]any{
		"summary": kpi.Summary{Version: kpi.SummaryVersion, Messages: 7, TriageTotal: 7, TriageCompleted: 5},
	})
	e.apply(h, "Incident", incC, 11, "ReviewSummarised", 64, map[string]any{
		"summary": kpi.Summary{Version: kpi.SummaryVersion - 1, Messages: 3},
	})

	t.Run("incidents without a current summary are listed for review", func(t *testing.T) {
		ids, err := e.open.ListClosedIncidentsForReview(t.Context(), kpi.SummaryVersion)
		require.NoError(t, err)
		assert.Equal(t, []uuid.UUID{incC, incE}, ids,
			"a stale summary and a missing one are worked out again, in the order they closed")

		ids, err = e.open.ListClosedIncidentsForReview(t.Context(), 0)
		require.NoError(t, err)
		assert.Equal(t, []uuid.UUID{incE}, ids, "only the one without any summary")
	})

	t.Run("summaries are listed per readable incident", func(t *testing.T) {
		all, err := e.open.ListReviewSummaries(t.Context())
		require.NoError(t, err)
		require.Len(t, all, 2)

		byID := map[uuid.UUID]int{}
		for _, s := range all {
			byID[s.IncidentID] = s.Summary.Messages
		}

		assert.Equal(t, map[uuid.UUID]int{incP: 7, incC: 3}, byID)

		mine, err := e.acl.ListReviewSummaries(e.as("sub|alice"))
		require.NoError(t, err)
		require.Len(t, mine, 1, "the restricted incident's summary is hidden")
		assert.Equal(t, incP, mine[0].IncidentID)
		assert.Equal(t, 5, mine[0].Summary.TriageCompleted)
	})

	t.Run("incident reports whether it has a review", func(t *testing.T) {
		got, err := e.open.GetIncident(t.Context(), incP)
		require.NoError(t, err)
		assert.True(t, got.HasReview)
		assert.True(t, got.IsClosed)
		assert.NotNil(t, got.ClosedAt)

		got, err = e.open.GetIncident(t.Context(), incE)
		require.NoError(t, err)
		assert.False(t, got.HasReview)
	})
}

func TestQueries_Messages(t *testing.T) {
	e := newEnv(t)
	e.seedAll()

	t.Run("ListMessages is ordered by message time, newest first", func(t *testing.T) {
		list, err := e.open.ListMessages(t.Context(), incP)
		require.NoError(t, err)
		require.Len(t, list, 2)
		assert.Equal(t, msg2, list[0].ID)
		assert.Equal(t, msg1, list[1].ID)

		m := list[0]
		assert.Equal(t, incP, m.IncidentID)
		assert.Equal(t, 2, m.Number)
		assert.Equal(t, "second", m.Content)
		assert.Equal(t, "phone", m.Medium)
		assert.Equal(t, "DONE", m.Triage)
		assert.Equal(t, "HIGH", m.Priority)
		assert.Equal(t, "sub|bob", m.AuthorSub)
		assert.Equal(t, time.Date(2026, 3, 1, 11, 0, 0, 0, time.UTC), m.Time)
		assert.Equal(t, []uuid.UUID{divLage}, m.DivisionIDs)
		assert.Equal(t, []uuid.UUID{resActive}, m.LinkedResourceIDs)
		require.Len(t, m.Acknowledgements, 1)
		assert.Equal(t, divLage, m.Acknowledgements[0].DivisionID)
		assert.Equal(t, "sub|bob", m.Acknowledgements[0].By)
		assert.Empty(t, list[1].Acknowledgements)
	})

	t.Run("ListMessages respects access", func(t *testing.T) {
		list, err := e.acl.ListMessages(e.as("sub|alice"), incP)
		require.NoError(t, err)
		assert.Len(t, list, 2)

		_, err = e.acl.ListMessages(e.as("sub|bob"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = e.acl.ListMessages(t.Context(), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("GetMessage", func(t *testing.T) {
		got, err := e.open.GetMessage(t.Context(), msg1)
		require.NoError(t, err)
		assert.Equal(t, "first", got.Content)

		_, err = e.open.GetMessage(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = e.acl.GetMessage(e.as("sub|bob"), msg1)
		require.ErrorIs(t, err, shared.ErrNotFound, "the incident of the message is not readable")

		got, err = e.acl.GetMessage(e.as("sub|alice"), msg1)
		require.NoError(t, err)
		assert.Equal(t, msg1, got.ID)
	})

	t.Run("ListIncidentMessageIDs checks no access", func(t *testing.T) {
		ids, err := e.acl.ListIncidentMessageIDs(t.Context(), incP)
		require.NoError(t, err)
		assert.ElementsMatch(t, []uuid.UUID{msg1, msg2}, ids)

		none, err := e.open.ListIncidentMessageIDs(t.Context(), incC)
		require.NoError(t, err)
		assert.Empty(t, none)
	})

	t.Run("attachments", func(t *testing.T) {
		list, err := e.open.ListAttachments(t.Context(), msg1)
		require.NoError(t, err)
		require.Len(t, list, 2)
		assert.Equal(t, att1, list[0].ID, "oldest first")
		assert.Equal(t, "a.png", list[0].Filename)
		assert.Equal(t, att2, list[1].ID)
		assert.Equal(t, int64(20), list[1].Size)
		assert.Equal(t, msg1, list[1].MessageID)
		assert.Equal(t, incP, list[1].IncidentID)
		assert.Equal(t, "sub|alice", list[1].UploaderSub)
		assert.Equal(t, "incidents/"+incP.String()+"/"+att2.String(), list[1].StorageKey)
		assert.Equal(t, "sum", list[1].Checksum)
		assert.Equal(t, "application/octet-stream", list[1].ContentType)
		assert.False(t, list[1].CreatedAt.IsZero())

		none, err := e.open.ListAttachments(t.Context(), msg2)
		require.NoError(t, err)
		assert.Empty(t, none)

		got, err := e.open.GetAttachment(t.Context(), att2)
		require.NoError(t, err)
		assert.Equal(t, "b.pdf", got.Filename)

		_, err = e.open.GetAttachment(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestQueries_Layers(t *testing.T) {
	e := newEnv(t)
	e.seedAll()

	t.Run("ListLayers returns the live layers of one incident ordered by name", func(t *testing.T) {
		layers, err := e.open.ListLayers(t.Context(), incP)
		require.NoError(t, err)
		require.Len(t, layers, 1, "the removed layer is left out")
		assert.Equal(t, layerP, layers[0].ID)
		assert.Equal(t, "B Own", layers[0].Name)
		assert.Equal(t, "Parent", layers[0].SourceIncidentName)
		assert.Equal(t, incP, layers[0].IncidentID)
		assert.Positive(t, layers[0].Revision)
		assert.JSONEq(t,
			`{"type":"FeatureCollection","features":[{"type":"Feature","id":"`+featP.String()+
				`","geometry":{"type":"Point","coordinates":[9,48]},"properties":{}}]}`,
			string(layers[0].GeoJSON))

		_, err = e.acl.ListLayers(e.as("sub|bob"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("ListVisibleLayers puts the own layers first, then those of readable children", func(t *testing.T) {
		layers, err := e.open.ListVisibleLayers(t.Context(), incP)
		require.NoError(t, err)
		require.Len(t, layers, 3)
		assert.Equal(t, []uuid.UUID{layerP, layerE, layerC},
			[]uuid.UUID{layers[0].ID, layers[1].ID, layers[2].ID},
			"own layer first, then by the name of the child incident")
		assert.Equal(t, "Child open", layers[1].SourceIncidentName)

		layers, err = e.acl.ListVisibleLayers(e.as("sub|alice"), incP)
		require.NoError(t, err)
		require.Len(t, layers, 2, "the layer of the child alice cannot read is hidden")
		assert.Equal(t, layerP, layers[0].ID)
		assert.Equal(t, layerE, layers[1].ID)

		_, err = e.acl.ListVisibleLayers(e.as("sub|carol"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("GetFeatureIncidentID finds the layer holding the feature", func(t *testing.T) {
		got, err := e.open.GetFeatureIncidentID(t.Context(), featC)
		require.NoError(t, err)
		assert.Equal(t, incC, got)

		_, err = e.open.GetFeatureIncidentID(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("feature changes", func(t *testing.T) {
		placements, err := e.open.ListFeaturePlacements(t.Context(), incP)
		require.NoError(t, err)
		assert.Equal(t, map[uuid.UUID]time.Time{
			featP: e.base.Add(40 * time.Minute),
			featC: e.base.Add(41 * time.Minute),
			featE: e.base.Add(42 * time.Minute),
		}, placements)

		placements, err = e.acl.ListFeaturePlacements(e.as("sub|alice"), incP)
		require.NoError(t, err)
		assert.Len(t, placements, 2, "the placement in the child alice cannot read is hidden")
		assert.NotContains(t, placements, featC)

		_, err = e.acl.ListFeaturePlacements(e.as("sub|bob"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)

		times, err := e.open.ListFeatureChangeTimes(t.Context(), incP)
		require.NoError(t, err)
		assert.Equal(t, []time.Time{
			e.base.Add(40 * time.Minute), e.base.Add(41 * time.Minute),
			e.base.Add(42 * time.Minute), e.base.Add(50 * time.Minute),
		}, times)

		times, err = e.acl.ListFeatureChangeTimes(e.as("sub|alice"), incP)
		require.NoError(t, err)
		assert.Len(t, times, 3)

		_, err = e.acl.ListFeatureChangeTimes(e.as("sub|bob"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)

		changes, err := e.open.ListFeatureChanges(t.Context(), incP)
		require.NoError(t, err)
		require.Len(t, changes, 4)
		assert.Equal(t, "placed", changes[0].Change)
		assert.Equal(t, featP, changes[0].FeatureID)
		assert.Equal(t, layerP, changes[0].LayerID)
		assert.Equal(t, incP, changes[0].IncidentID)
		require.NotNil(t, changes[0].MessageID)
		assert.Equal(t, msg1, *changes[0].MessageID)
		assert.Equal(t, "seed", changes[0].Actor)
		assert.JSONEq(t, `{"type":"Point","coordinates":[8,47]}`, string(changes[0].Geometry))
		assert.Nil(t, changes[1].MessageID, "a change without a message has no message id")
		assert.Equal(t, "moved", changes[3].Change)
		assert.Equal(t, 2, changes[3].Version)
		assert.Equal(t, msg2, *changes[3].MessageID)
		assert.Empty(t, changes[3].Properties)

		changes, err = e.acl.ListFeatureChanges(e.as("sub|alice"), incP)
		require.NoError(t, err)
		assert.Len(t, changes, 3)

		_, err = e.acl.ListFeatureChanges(e.as("sub|bob"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("ListFeatureMessages returns the messages connected to a feature", func(t *testing.T) {
		msgs, err := e.open.ListFeatureMessages(t.Context(), featP)
		require.NoError(t, err)
		require.Len(t, msgs, 2)
		assert.Equal(t, msg1, msgs[0].ID, "oldest message first")
		assert.Equal(t, msg2, msgs[1].ID)

		none, err := e.open.ListFeatureMessages(t.Context(), featC)
		require.NoError(t, err)
		assert.Empty(t, none)

		_, err = e.open.ListFeatureMessages(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = e.acl.ListFeatureMessages(e.as("sub|alice"), featC)
		require.ErrorIs(t, err, shared.ErrNotFound, "the feature lies in an incident alice cannot read")
	})
}

func TestQueries_SchadenplatzAndResources(t *testing.T) {
	e := newEnv(t)

	const (
		sp  = "readmodel.schadenplatz"
		res = "readmodel.resource"
	)

	e.apply(
		sp,
		"Schadenplatz",
		spOther,
		1,
		"Created",
		0,
		map[string]any{"incidentId": incP, "name": "Zeta", "isDefault": false},
	)
	e.apply(
		sp,
		"Schadenplatz",
		spDefault,
		1,
		"Created",
		1,
		map[string]any{"incidentId": incP, "name": "Default", "isDefault": true},
	)
	e.apply(
		sp,
		"Schadenplatz",
		spMerged,
		1,
		"Created",
		2,
		map[string]any{"incidentId": incP, "name": "Alpha", "isDefault": false},
	)
	e.apply(sp, "Schadenplatz", spMerged, 2, "MergedIntoDefault", 3, map[string]any{"defaultSchadenplatzId": spDefault})
	e.apply(
		sp,
		"Schadenplatz",
		spDefault,
		2,
		"GeometrySet",
		4,
		map[string]any{"geoJson": []byte(`{"type":"Point","coordinates":[1,2]}`)},
	)
	e.apply(sp, "Schadenplatz", spDefault, 3, "CasualtiesRecorded", 5, map[string]any{
		"sourceMessageId": msg1,
		"deltas": map[string]any{
			"vermisste":       1,
			"tote":            2,
			"verletzte":       3,
			"obdachlose":      4,
			"eingeschlossene": 5,
		},
	})

	t.Run("schadenplaetze", func(t *testing.T) {
		got, err := e.open.GetSchadenplatz(t.Context(), spDefault)
		require.NoError(t, err)
		assert.Equal(t, "Default", got.Name)
		assert.True(t, got.IsDefault)
		assert.JSONEq(t, `{"type":"Point","coordinates":[1,2]}`, string(got.GeoJSON))
		assert.Equal(t, 5, got.Casualties.Eingeschlossene)
		assert.Equal(t, 2, got.Casualties.Tote)
		assert.Nil(t, got.MergedInto)

		merged, err := e.open.GetSchadenplatz(t.Context(), spMerged)
		require.NoError(t, err)
		assert.True(t, merged.IsMerged)
		require.NotNil(t, merged.MergedInto)
		assert.Equal(t, spDefault, *merged.MergedInto)
		assert.Nil(t, merged.GeoJSON)

		_, err = e.open.GetSchadenplatz(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		live, err := e.open.ListSchadenplaetze(t.Context(), incP)
		require.NoError(t, err)
		require.Len(t, live, 2, "merged schadenplaetze are left out")
		assert.Equal(t, spDefault, live[0].ID, "the default comes first")
		assert.Equal(t, spOther, live[1].ID)

		all, err := e.open.ListAllSchadenplaetze(t.Context(), incP)
		require.NoError(t, err)
		require.Len(t, all, 3)
		assert.Equal(t, []uuid.UUID{spDefault, spMerged, spOther}, []uuid.UUID{all[0].ID, all[1].ID, all[2].ID},
			"default first, then by name")

		none, err := e.open.ListSchadenplaetze(t.Context(), incC)
		require.NoError(t, err)
		assert.Empty(t, none)
	})

	t.Run("casualties", func(t *testing.T) {
		list, err := e.open.ListMessageCasualties(t.Context(), msg1)
		require.NoError(t, err)
		require.Len(t, list, 1)
		assert.Equal(t, msg1, list[0].MessageID)
		assert.Equal(t, spDefault, list[0].SchadenplatzID)
		assert.Equal(t, 1, list[0].Vermisste)
		assert.Equal(t, 2, list[0].Tote)
		assert.Equal(t, 3, list[0].Verletzte)
		assert.Equal(t, 4, list[0].Obdachlose)
		assert.Equal(t, 5, list[0].Eingeschlossene)

		none, err := e.open.ListMessageCasualties(t.Context(), msg2)
		require.NoError(t, err)
		assert.Empty(t, none)

		has, err := e.open.HasCasualtyRecords(t.Context(), incP)
		require.NoError(t, err)
		assert.True(t, has)

		has, err = e.open.HasCasualtyRecords(t.Context(), incC)
		require.NoError(t, err)
		assert.False(t, has)

		// A record that was corrected back to zero is no casualty record.
		e.apply(sp, "Schadenplatz", spDefault, 4, "CasualtiesRecorded", 6, map[string]any{
			"sourceMessageId": msg1, "deltas": map[string]any{},
		})

		has, err = e.open.HasCasualtyRecords(t.Context(), incP)
		require.NoError(t, err)
		assert.False(t, has)
	})

	alerted := func(id uuid.UUID, minutes int, name string, extra map[string]any) {
		data := map[string]any{
			"incidentId": incP, "schadenplatzId": spDefault, "formation": "FW", "name": name,
			"size": "GRUPPE", "personnelCount": 6, "hauptaufgabe": "Loeschen",
		}
		maps.Copy(data, extra)

		e.apply(res, "Resource", id, 1, "Alerted", minutes, data)
	}

	alerted(resActive, 10, "Alpha", map[string]any{
		"contact":         map[string]any{"medium": "radio", "detail": "K1"},
		"homeLocation":    map[string]any{"name": "Depot", "coordinates": []float64{47.1, 8.2}},
		"sourceMessageId": msg1,
	})
	alerted(resOld, 11, "Beta", nil)
	alerted(resBare, 12, "Gamma", map[string]any{"schadenplatzId": spOther})

	e.apply(res, "Resource", resActive, 2, "Deployed", 20, map[string]any{
		"deploymentLocation": map[string]any{"label": "Ost", "lat": 47.5, "lng": 8.5},
	})
	e.apply(res, "Resource", resActive, 3, "StoodDown", 21, map[string]any{})
	e.apply(res, "Resource", resActive, 5, "DeploymentLocationUpdated", 22, map[string]any{
		"location": map[string]any{"label": "Ost", "lat": 47.5, "lng": 8.5},
	})
	e.apply(res, "Resource", resActive, 4, "SuccessionLinked", 22, map[string]any{"predecessorId": resOld})
	e.apply(res, "Resource", resOld, 2, "MarkedReady", 23, map[string]any{})
	e.apply(res, "Resource", resOld, 3, "Relieved", 24, map[string]any{"successorId": resActive})

	t.Run("resources", func(t *testing.T) {
		got, err := e.open.GetResource(t.Context(), resActive)
		require.NoError(t, err)
		assert.Equal(t, "Alpha", got.Name)
		assert.Equal(t, incP, got.IncidentID)
		assert.Equal(t, spDefault, got.SchadenplatzID)
		assert.Equal(t, "EINSATZBEREIT", got.Status)
		assert.Equal(t, 6, got.PersonnelCount)
		assert.Empty(t, got.Hauptaufgabe, "standing down clears the task")
		require.NotNil(t, got.ContactMedium)
		assert.Equal(t, "radio", *got.ContactMedium)
		require.NotNil(t, got.ContactDetail)
		assert.Equal(t, "K1", *got.ContactDetail)
		require.NotNil(t, got.HomeLocationName)
		assert.Equal(t, "Depot", *got.HomeLocationName)
		require.NotNil(t, got.HomeLocationLat)
		assert.InDelta(t, 47.1, *got.HomeLocationLat, 1e-9)
		require.NotNil(t, got.HomeLocationLng)
		assert.InDelta(t, 8.2, *got.HomeLocationLng, 1e-9)
		require.NotNil(t, got.PredecessorID)
		assert.Equal(t, resOld, *got.PredecessorID)
		require.NotNil(t, got.SourceMessageID)
		assert.Equal(t, msg1, *got.SourceMessageID)
		assert.Nil(t, got.SuccessorID)
		require.NotNil(t, got.DeployedAt)
		require.NotNil(t, got.StoodDownAt)
		assert.Nil(t, got.RelievedAt)
		assert.Equal(t, e.base.Add(21*time.Minute), got.StatusAt)

		require.NotNil(t, got.DeploymentLocation)
		assert.Equal(t, "Ost", got.DeploymentLocation.Label)
		require.NotNil(t, got.DeploymentLocation.Lat)
		assert.InDelta(t, 47.5, *got.DeploymentLocation.Lat, 1e-9)

		require.Len(t, got.DeploymentHistory, 1)
		period := got.DeploymentHistory[0]
		assert.Equal(t, e.base.Add(20*time.Minute), period.StartedAt)
		require.NotNil(t, period.EndedAt)
		assert.Equal(t, e.base.Add(21*time.Minute), *period.EndedAt)
		assert.Equal(t, spDefault, period.SchadenplatzID)
		assert.Equal(t, "Alpha", period.Name)
		assert.Equal(t, "Loeschen", period.Hauptaufgabe)
		assert.Equal(t, 6, period.PersonnelCount)
		require.NotNil(t, period.DeploymentLabel)
		assert.Equal(t, "Ost", *period.DeploymentLabel)

		bare, err := e.open.GetResource(t.Context(), resBare)
		require.NoError(t, err)
		assert.Nil(t, bare.ContactMedium)
		assert.Nil(t, bare.HomeLocationName)
		assert.Nil(t, bare.DeploymentLocation)
		assert.Nil(t, bare.PredecessorID)
		assert.Nil(t, bare.SourceMessageID)
		assert.Empty(t, bare.DeploymentHistory)

		old, err := e.open.GetResource(t.Context(), resOld)
		require.NoError(t, err)
		assert.Equal(t, "ABGELOEST", old.Status)
		require.NotNil(t, old.SuccessorID)
		assert.Equal(t, resActive, *old.SuccessorID)
		assert.NotNil(t, old.RelievedAt)
		assert.NotNil(t, old.EinsatzEnde)
		assert.NotNil(t, old.EinsatzBeginn)

		_, err = e.open.GetResource(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("resource listings", func(t *testing.T) {
		onSite, err := e.open.ListResourcesForSchadenplatz(t.Context(), spDefault)
		require.NoError(t, err)
		require.Len(t, onSite, 1, "relieved resources are no longer on the schadenplatz")
		assert.Equal(t, resActive, onSite[0].ID)

		forIncident, err := e.open.ListResourcesForIncident(t.Context(), incP)
		require.NoError(t, err)
		assert.Len(t, forIncident, 3)

		_, err = e.acl.ListResourcesForIncident(e.as("sub|bob"), incP)
		require.ErrorIs(t, err, shared.ErrNotFound)

		none, err := e.open.ListResourcesForSchadenplatz(t.Context(), uuid.New())
		require.NoError(t, err)
		assert.Empty(t, none)
	})
}
