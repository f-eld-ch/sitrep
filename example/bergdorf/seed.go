//go:build ignore

// Seed the example incident "Unwetter Bergdorf – Murgang Dorfbach" into a running sitrep.
//
// Used for the documentation screenshots (sitrep.ch) and as a reproducible demo. It talks to the
// GraphQL API of a server started with insecure-local-auth (see start.sh) and builds every input
// from the generated GraphQL models of the backend, so a schema change breaks this program at
// compile time instead of at runtime.
//
//	go run seed.go                                  # http://localhost:4181, date 2026-11-04
//	go run seed.go -url http://localhost:4180 -date 2026-11-06 -if-empty
//
// What it creates (everything is fictional):
//
//   - the incident with its divisions (Chef Einsatz, Chef Logistik, C Lage, Stabschef; the
//     Nachrichtenkarte division is added by the backend),
//   - messages 1 to 10, triaged, with persons and resources, and message 11 (the canton asks
//     for a Lagemeldung), left pending. The documentation tutorials create messages 12 and 13
//     themselves, so the screenshots show message 12.
//
// Notes:
//
//   - The history is condensed. Resource events (ready, deployed) are sent with explicit times,
//     so the Mitteltabelle looks like a real operation, even where one message carries several
//     events.
//   - What is drawn on the Nachrichtenkarte comes from features.json, which export-features.go
//     writes after drawing by hand once. It is replayed after the triage of each message, like
//     an operator would do, and the messages are then marked as drawn. No attachments are created.
//   - Times are Europe/Zurich. The date must be in the past: messages may not lie in the future.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"slices"
	"strings"
	"time"

	_ "embed"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
)

const (
	incidentName = "Unwetter Bergdorf – Murgang Dorfbach"
	receiver     = "Gemeindeführungsstab"
	gfsPhone     = "041 555 00 00"
	mapDivision  = "Karte" // key for the Nachrichtenkarte in message divisions
)

// division is a division of the incident; description is what the UI shows.
type division struct{ name, description string }

var divisions = []division{
	{"Chef Einsatz", "Chef Einsatz"},
	{"Chef Logistik", "Chef Logistik"},
	{"C Lage", "C Lage"},
	{"Stabschef", "Stabschef"},
}

type resourceEvent struct {
	action string // "ready" or "deploy"
	at     string // HH:MM
	place  string // deployment location, for "deploy"
}

type resourceSeed struct {
	formation model.ResourceFormation
	home      string
	name      string
	size      model.ResourceUnitSize
	personnel int
	task      string
	contact   *model.ResourceContactInput
	alert     string // HH:MM
	events    []resourceEvent
}

var resources = map[string]resourceSeed{
	"san_g1": {
		formation: model.ResourceFormationSan, home: "Region Bergdorf", name: "Gruppe 1",
		size: model.ResourceUnitSizeGruppe, personnel: 6, task: "Erstversorgung und Transport",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumPhone, Detail: "144"},
		alert:   "06:48",
		events:  []resourceEvent{{"ready", "06:58", ""}, {"deploy", "07:10", "Dorfstrasse"}},
	},
	"fw_zug1": {
		formation: model.ResourceFormationFw, home: "Bergdorf", name: "Zug 1",
		size: model.ResourceUnitSizeZug, personnel: 28, task: "Menschenrettung",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumRadio, Detail: "Kanal 1"},
		alert:   "06:55",
		events:  []resourceEvent{{"ready", "06:55", ""}, {"deploy", "06:55", "Dorfstrasse 12/14"}},
	},
	"pol_pat1": {
		formation: model.ResourceFormationPol, home: "Kanton", name: "Patrouille 1",
		size: model.ResourceUnitSizeTrupp, personnel: 4, task: "Absperrung und Verkehrslenkung",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumRadio, Detail: "Kanal 2"},
		alert:   "07:18",
		events:  []resourceEvent{{"ready", "07:18", ""}, {"deploy", "07:18", "Dorfstrasse"}},
	},
	"zs_betr1": {
		formation: model.ResourceFormationZs, home: "Bergdorf", name: "Betreuer Gruppe 1",
		size: model.ResourceUnitSizeGruppe, personnel: 12, task: "Betreuung Notunterkunft Turnhalle",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumPhone, Detail: "079 555 01 12"},
		alert:   "07:30",
		events:  []resourceEvent{{"ready", "07:50", ""}, {"deploy", "08:00", "Turnhalle"}},
	},
	"tb_trupp1": {
		formation: model.ResourceFormationTechnb, home: "Bergdorf", name: "Trupp 1",
		size: model.ResourceUnitSizeTrupp, personnel: 4, task: "Strom und Wasser sichern",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumPhone, Detail: "041 555 02 02"},
		alert:   "07:55",
		events:  []resourceEvent{{"ready", "07:55", ""}, {"deploy", "07:55", "Unterdorf"}},
	},
	"zs_piz1": {
		formation: model.ResourceFormationZs, home: "Region Flachland", name: "PiZ 1",
		size: model.ResourceUnitSizeZug, personnel: 30, task: "Räumung und Sandsäcke",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumPhone, Detail: "079 555 01 30"},
		alert:   "08:10",
	},
	"fw_gr1": {
		formation: model.ResourceFormationFw, home: "Oberdorf", name: "Gruppe 1",
		size: model.ResourceUnitSizeGruppe, personnel: 10, task: "Reserve Menschenrettung",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumRadio, Detail: "Kanal 1"},
		alert:   "08:20",
		events:  []resourceEvent{{"ready", "08:25", ""}},
	},
	"armee_zug1": {
		formation: model.ResourceFormationArmee, home: "Katastrophenhilfe", name: "Zug 1",
		size: model.ResourceUnitSizeZug, personnel: 40, alert: "08:38",
	},
}

type messageSeed struct {
	time      string // HH:MM
	medium    model.Medium
	sender    string
	detail    string // phone number, or radio channel
	content   string
	priority  model.PriorityStatus
	divisions []string // names from divisions, or mapDivision
	casualty  *model.CasualtyDeltasInput
	resources []string // keys of resources, alerted (and linked) with this message
	pending   bool     // leave untriaged
}

// The order is the message number.
var messages = []messageSeed{
	{
		time: "06:48", medium: model.MediumPhone, sender: "Sanität Region Bergdorf", detail: "144",
		content: "Murgang im Dorfbach, Dorfstrasse betroffen. Sanitätsgruppe 1 mit 6 Personen aufgeboten, " +
			"Einsatz ab 07:10. Drei Personen werden vermisst, zwei Personen sind leicht verletzt.",
		priority: model.PriorityStatusNormal, divisions: []string{"Chef Einsatz", "C Lage", mapDivision},
		casualty: &model.CasualtyDeltasInput{Vermisste: 3, Verletzte: 2}, resources: []string{"san_g1"},
	},
	{
		time: "06:55", medium: model.MediumRadio, sender: "Feuerwehr Bergdorf", detail: "Kanal 1",
		content:  "Zug 1 mit 28 AdF ist vor Ort und beginnt mit der Menschenrettung bei der Dorfstrasse 12/14.",
		priority: model.PriorityStatusNormal, divisions: []string{"Chef Einsatz", mapDivision},
		resources: []string{"fw_zug1"},
	},
	{
		time: "07:18", medium: model.MediumRadio, sender: "Kantonspolizei", detail: "Kanal 2",
		content:  "Dorfstrasse ab Gotthardstrasse gesperrt, Verkehr wird umgeleitet. Eine Patrouille ist vor Ort.",
		priority: model.PriorityStatusNormal, divisions: []string{"Chef Einsatz", mapDivision},
		resources: []string{"pol_pat1"},
	},
	{
		time: "07:30", medium: model.MediumPhone, sender: "Gemeindeschreiberin", detail: "041 555 03 03",
		content: "Evakuation Unterdorf angeordnet. Rund 22 Personen müssen die Häuser verlassen. " +
			"Sammelstelle ist die Turnhalle. Betreuung wird benötigt.",
		priority:  model.PriorityStatusHigh,
		divisions: []string{"Chef Einsatz", "Chef Logistik", "C Lage", "Stabschef", mapDivision},
		casualty:  &model.CasualtyDeltasInput{Obdachlose: 22}, resources: []string{"zs_betr1"},
	},
	{
		time: "07:42", medium: model.MediumRadio, sender: "Feuerwehr Bergdorf", detail: "Kanal 1",
		content: "Eine vermisste Person lebend geborgen, verletzt. Eine weitere Person tot geborgen. " +
			"Eine Person bleibt vermisst (Keller Dorfstrasse 14).",
		priority: model.PriorityStatusHigh, divisions: []string{"C Lage", mapDivision},
		casualty: &model.CasualtyDeltasInput{Vermisste: -2, Verletzte: 1, Tote: 1},
	},
	{
		time: "07:55", medium: model.MediumPhone, sender: "Technische Betriebe", detail: "041 555 02 02",
		content: "Strom im Unterdorf abgestellt. Trinkwasserleitung gebrochen. Werkdienst mit 4 Personen " +
			"vor Ort, Ersatzwasser wird bereitgestellt.",
		priority: model.PriorityStatusNormal, divisions: []string{"Chef Logistik", "C Lage", mapDivision},
		resources: []string{"tb_trupp1"},
	},
	{
		time: "08:10", medium: model.MediumPhone, sender: "Zivilschutz Region", detail: "041 555 01 01",
		content:  "Zug Unterstützung aufgeboten: 30 AAZS. Einsatzbereit ab 09:00 für Räumung und Sandsäcke.",
		priority: model.PriorityStatusNormal, divisions: []string{"Chef Einsatz", "Chef Logistik", mapDivision},
		resources: []string{"zs_piz1"},
	},
	{
		time: "08:20", medium: model.MediumRadio, sender: "Feuerwehr Nachbargemeinde", detail: "Kanal 1",
		content: "Unterstützung mit einer Gruppe, 10 AdF, ab sofort verfügbar. " +
			"Stehen bei Feuerwehrmagazin Oberdorf bereit.",
		priority: model.PriorityStatusNormal, divisions: []string{"Chef Einsatz", mapDivision},
		resources: []string{"fw_gr1"},
	},
	{
		time: "08:32", medium: model.MediumRadio, sender: "Feuerwehr Bergdorf", detail: "Kanal 1",
		content: "Vermisste Person im Keller Dorfstrasse 14 gefunden, leblos. 2 weitere Personen aus Haus 16 " +
			"mit leichten Verletzungen gemeldet. 15 zusätzliche Personen aus dem Oberdorf sind in der " +
			"Turnhalle eingetroffen.",
		priority: model.PriorityStatusNormal, divisions: []string{mapDivision},
		casualty: &model.CasualtyDeltasInput{Vermisste: -1, Tote: 1, Verletzte: 2, Obdachlose: 15},
	},
	{
		time: "08:38", medium: model.MediumPhone, sender: "Armee", detail: "041 555 01 01",
		content: "Zug Katastrophenhilfe mit 40 Armeeangehörigen kann ab 11:00 bereitstehen. " +
			"Einfindung beim Sportplatz, Einsatzleiter Armee findet sich im GFS ein.",
		priority: model.PriorityStatusNormal, divisions: []string{mapDivision}, resources: []string{"armee_zug1"},
	},
	{
		time: "08:45", medium: model.MediumPhone, sender: "Kantonaler Führungsstab", detail: "041 555 01 01",
		content:  "Bitte bis 09:30 Lagemeldung mit aktueller Personen- und Mittelübersicht einreichen.",
		priority: model.PriorityStatusNormal, pending: true,
	},
}

// ---- map objects (from features.json) --------------------------------------------------------

//go:embed features.json
var featuresJSON []byte

type featureStep struct {
	Message    int             `json:"message"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties json.RawMessage `json:"properties"`
}

type featureSeed struct {
	Key   string        `json:"key"`
	Steps []featureStep `json:"steps"`
}

type featuresFile struct {
	Features     []featureSeed `json:"features"`
	Acknowledged []int         `json:"acknowledged"`
}

// ---- GraphQL client -------------------------------------------------------------------------

type client struct {
	endpoint string
	http     *http.Client
}

type gqlResponse[T any] struct {
	Data   T `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

// call sends one operation and decodes the data into T.
func call[T any](ctx context.Context, c *client, query string, vars any) (T, error) {
	var zero T

	body, err := json.Marshal(map[string]any{"query": query, "variables": vars})
	if err != nil {
		return zero, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return zero, err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return zero, fmt.Errorf("cannot reach %s: %w", c.endpoint, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, err
	}

	var out gqlResponse[T]
	if err := json.Unmarshal(raw, &out); err != nil {
		return zero, fmt.Errorf("decode response (%s): %w", resp.Status, err)
	}

	if len(out.Errors) > 0 {
		msgs := make([]string, len(out.Errors))
		for i, e := range out.Errors {
			msgs[i] = e.Message
		}

		return zero, fmt.Errorf("graphql: %s", strings.Join(msgs, "; "))
	}

	return out.Data, nil
}

type id struct {
	ID string `json:"id"`
}

type schadenplatz struct {
	ID        string `json:"id"`
	IsDefault bool   `json:"isDefault"`
}

type incidentData struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Divisions []struct {
		ID          string `json:"id"`
		Description string `json:"description"`
		Kind        string `json:"kind"`
	} `json:"divisions"`
	Schadenplaetze []schadenplatz `json:"schadenplaetze"`
}

// defaultSchadenplatz waits for the read model: the projector fills it a moment after the incident
// is created.
func defaultSchadenplatz(ctx context.Context, c *client, incidentID string, known []schadenplatz) (string, error) {
	for range 40 {
		for _, sp := range known {
			if sp.IsDefault {
				return sp.ID, nil
			}
		}

		time.Sleep(250 * time.Millisecond)

		got, err := call[struct {
			Incident incidentData `json:"incident"`
		}](ctx, c, `query($id: ID!) { incident(id: $id) { schadenplaetze { id isDefault } } }`,
			map[string]any{"id": incidentID})
		if err != nil {
			return "", err
		}

		known = got.Incident.Schadenplaetze
	}

	return "", errors.New("the default Schadenplatz did not appear; is the projector running?")
}

// messageMapLayer waits for the layer of the Nachrichtenkarte: like the Schadenplatz it comes from
// the read model.
func messageMapLayer(ctx context.Context, c *client, incidentID string) (string, error) {
	for range 40 {
		got, err := call[struct {
			Layers []struct {
				ID   string `json:"id"`
				Kind string `json:"kind"`
			} `json:"layersForIncident"`
		}](ctx, c, `query($id: ID!) { layersForIncident(incidentId: $id) { id kind } }`,
			map[string]any{"id": incidentID})
		if err != nil {
			return "", err
		}

		for _, l := range got.Layers {
			if l.Kind == "MESSAGE_MAP" {
				return l.ID, nil
			}
		}

		time.Sleep(250 * time.Millisecond)
	}

	return "", errors.New("the layer of the Nachrichtenkarte did not appear")
}

// ---- seeding --------------------------------------------------------------------------------

type seeder struct {
	c          *client
	day        time.Time
	bergdorfID string // the main incident, set by seed
}

// at turns "HH:MM" into a time on the day of the operation.
func (s *seeder) at(hhmm string) (time.Time, error) {
	var h, m int
	if _, err := fmt.Sscanf(hhmm, "%d:%d", &h, &m); err != nil {
		return time.Time{}, fmt.Errorf("bad time %q: %w", hhmm, err)
	}

	return s.day.Add(time.Duration(h)*time.Hour + time.Duration(m)*time.Minute), nil
}

func (s *seeder) mustAt(hhmm string) time.Time {
	t, err := s.at(hhmm)
	if err != nil {
		panic(err)
	}

	return t
}

func main() {
	url := flag.String("url", "http://localhost:4181", "server URL")
	date := flag.String("date", "2026-11-04", "day of the operation (YYYY-MM-DD)")
	ifEmpty := flag.Bool("if-empty", false, "do nothing if the incident exists already")
	flag.Parse()

	if err := run(context.Background(), *url, *date, *ifEmpty); err != nil {
		fmt.Fprintln(os.Stderr, "seed:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, url, date string, ifEmpty bool) error {
	zurich, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		return err
	}

	day, err := time.ParseInLocation("2006-01-02", date, zurich)
	if err != nil {
		return fmt.Errorf("bad -date: %w", err)
	}

	s := &seeder{
		c: &client{
			endpoint: strings.TrimRight(url, "/") + "/api/v2/graphql",
			http:     &http.Client{Timeout: 30 * time.Second},
		},
		day: day,
	}

	names, err := call[struct {
		Incidents []struct {
			Name string `json:"name"`
		} `json:"incidents"`
	}](ctx, s.c, `{ incidents { name } }`, nil)
	if err != nil {
		return err
	}

	for _, i := range names.Incidents {
		if i.Name == incidentName {
			if ifEmpty {
				fmt.Println("incident exists, nothing to do")

				return nil
			}

			return fmt.Errorf("incident %q exists already; reset the database (start.sh --reset)", incidentName)
		}
	}

	if err := s.seed(ctx); err != nil {
		return err
	}

	return s.seedExtras(ctx)
}

func (s *seeder) seed(ctx context.Context) error {
	loc := "Bergdorf"
	input := model.CreateIncidentInput{Name: incidentName, Location: &loc, Layers: []*model.LayerInput{}}

	for _, d := range divisions {
		input.Divisions = append(input.Divisions, &model.DivisionInput{Name: d.name, Description: d.description})
	}

	created, err := call[struct {
		CreateIncident struct {
			Incident incidentData `json:"incident"`
		} `json:"createIncident"`
	}](ctx, s.c, `mutation($input: CreateIncidentInput!) {
		createIncident(input: $input) {
			incident { id name divisions { id description kind } schadenplaetze { id isDefault } }
		} }`, map[string]any{"input": input})
	if err != nil {
		return err
	}

	incident := created.CreateIncident.Incident
	s.bergdorfID = incident.ID
	fmt.Println("incident", incident.ID)

	spID, err := defaultSchadenplatz(ctx, s.c, incident.ID, incident.Schadenplaetze)
	if err != nil {
		return err
	}

	// division ids by the keys used in the messages
	divIDs := map[string]string{}

	for _, d := range incident.Divisions {
		if d.Kind == "MESSAGE_MAP" {
			divIDs[mapDivision] = d.ID

			continue
		}

		for _, want := range divisions {
			if want.description == d.Description {
				divIDs[want.name] = d.ID
			}
		}
	}

	if len(divIDs) != len(divisions)+1 {
		return fmt.Errorf("expected %d divisions, found %d", len(divisions)+1, len(divIDs))
	}

	var drawn featuresFile
	if err := json.Unmarshal(featuresJSON, &drawn); err != nil {
		return fmt.Errorf("features.json: %w", err)
	}

	layerID, err := messageMapLayer(ctx, s.c, incident.ID)
	if err != nil {
		return err
	}

	featureIDs := map[string]string{} // key -> feature id
	resourceIDs := map[string]string{}

	for n, m := range messages {
		number := n + 1

		msgTime, err := s.at(m.time)
		if err != nil {
			return err
		}

		detail := m.detail
		receiverDetail := gfsPhone

		if m.medium == model.MediumRadio {
			receiverDetail = detail
		}

		msg, err := call[struct {
			CreateMessage struct {
				ID     string `json:"id"`
				Number int    `json:"number"`
			} `json:"createMessage"`
		}](ctx, s.c, `mutation($input: CreateMessageInput!) { createMessage(input: $input) { id number } }`,
			map[string]any{"input": model.CreateMessageInput{
				IncidentID: incident.ID, Sender: m.sender, SenderDetail: detail,
				Receiver: receiver, ReceiverDetail: receiverDetail,
				Content: m.content, Medium: m.medium, Time: &msgTime,
			}})
		if err != nil {
			return err
		}

		if msg.CreateMessage.Number != number {
			return fmt.Errorf("message number %d, expected %d", msg.CreateMessage.Number, number)
		}

		messageID := msg.CreateMessage.ID

		if m.pending {
			fmt.Printf("#%d %s pending\n", number, m.time)

			continue
		}

		// Resources first, so they can be linked to the message.
		var linked []string

		for _, key := range m.resources {
			rid, err := s.alert(ctx, incident.ID, spID, messageID, resources[key])
			if err != nil {
				return fmt.Errorf("resource %s: %w", key, err)
			}

			resourceIDs[key] = rid

			linked = append(linked, rid)
		}

		if m.casualty != nil {
			if _, err := call[struct{}](
				ctx,
				s.c,
				`mutation($id: ID!, $msg: ID!, $at: DateTime, $input: CasualtyDeltasInput!) {
				recordCasualties(id: $id, sourceMessageId: $msg, occurredAt: $at, input: $input) { id } }`,
				map[string]any{"id": spID, "msg": messageID, "at": msgTime, "input": *m.casualty},
			); err != nil {
				return err
			}
		}

		divisionIDs := make([]string, 0, len(m.divisions))
		for _, d := range m.divisions {
			divisionIDs = append(divisionIDs, divIDs[d])
		}

		if linked == nil {
			linked = []string{}
		}

		if _, err := call[struct{}](ctx, s.c, `mutation($id: ID!, $input: TriageMessageInput!) {
			triageMessage(id: $id, input: $input) { id } }`,
			map[string]any{"id": messageID, "input": model.TriageMessageInput{
				Triage: model.TriageStatusDone, Priority: m.priority,
				DivisionIds: divisionIDs, LinkedResourceIds: linked,
			}}); err != nil {
			return err
		}

		placed, err := s.draw(ctx, incident.ID, layerID, messageID, number, drawn, featureIDs)
		if err != nil {
			return fmt.Errorf("message %d: %w", number, err)
		}

		if slices.Contains(drawn.Acknowledged, number) {
			if _, err := call[struct{}](ctx, s.c, `mutation($id: ID!, $division: ID!) {
				acknowledgeMessage(id: $id, divisionId: $division) { id } }`,
				map[string]any{"id": messageID, "division": divIDs[mapDivision]}); err != nil {
				return err
			}
		}

		fmt.Printf("#%d %s triaged, %d map objects\n", number, m.time, placed)
	}

	fmt.Printf("done: %d messages, %d resources\n", len(messages), len(resourceIDs))

	return nil
}

// ---- more incidents: the hierarchy of the incident list ---------------------------------------

// callAfterAccess retries an operation on a new incident until the access rights of its creator are
// there: they come from the read model, a moment after the incident is created.
func callAfterAccess(ctx context.Context, c *client, query string, vars any) error {
	var err error

	for range 40 {
		if _, err = call[struct{}](ctx, c, query, vars); err == nil || !strings.Contains(err.Error(), "FORBIDDEN") {
			return err
		}

		time.Sleep(250 * time.Millisecond)
	}

	return err
}

const (
	cantonalIncidentName = "Unwetter Kanton – Kantonales Führungsorgan"
	regionalIncidentName = "Unwetter Talschaft Süd – Regionales Führungsorgan"
	closedIncidentName   = "Hochwasserübung Hafen"
)

// createIncident creates an incident with the standard divisions, below parentID when given.
func (s *seeder) createIncident(ctx context.Context, name, location string, parentID *string) (incidentData, error) {
	input := model.CreateIncidentInput{
		Name:     name,
		Location: &location,
		ParentID: parentID,
		Layers:   []*model.LayerInput{},
	}

	for _, d := range divisions {
		input.Divisions = append(input.Divisions, &model.DivisionInput{Name: d.name, Description: d.description})
	}

	created, err := call[struct {
		CreateIncident struct {
			Incident incidentData `json:"incident"`
		} `json:"createIncident"`
	}](ctx, s.c, `mutation($input: CreateIncidentInput!) {
		createIncident(input: $input) {
			incident { id name divisions { id description kind } schadenplaetze { id isDefault } }
		} }`, map[string]any{"input": input})
	if err != nil {
		return incidentData{}, fmt.Errorf("incident %q: %w", name, err)
	}

	return created.CreateIncident.Incident, nil
}

// seedExtras adds the incidents around the example: the cantonal Führungsorgan with the regional
// ones below it (the Bergdorf incident is one of them), and a closed incident. The incident list
// and the documentation of parent incidents show them.
func (s *seeder) seedExtras(ctx context.Context) error {
	canton, err := s.createIncident(ctx, cantonalIncidentName, "Kanton", nil)
	if err != nil {
		return err
	}

	region, err := s.createIncident(ctx, regionalIncidentName, "Talschaft Süd", &canton.ID)
	if err != nil {
		return err
	}

	if err := s.seedRegion(ctx, region); err != nil {
		return err
	}

	// The main example becomes a regional incident below the cantonal one.
	if err := callAfterAccess(ctx, s.c, `mutation($child: ID!, $parent: ID!) {
		linkIncidentParent(childId: $child, parentId: $parent) { id } }`,
		map[string]any{"child": s.bergdorfID, "parent": canton.ID}); err != nil {
		return err
	}

	closed, err := s.createIncident(ctx, closedIncidentName, "Hafen", nil)
	if err != nil {
		return err
	}

	if err := callAfterAccess(ctx, s.c, `mutation($id: ID!) { closeIncident(id: $id) { id } }`,
		map[string]any{"id": closed.ID}); err != nil {
		return err
	}

	fmt.Printf(
		"extras: %q with %q and %q below it, %q closed\n",
		cantonalIncidentName,
		incidentName,
		regionalIncidentName,
		closedIncidentName,
	)

	return nil
}

// seedRegion gives the second regional incident a little data (one message, persons, one
// resource), so that the cantonal incident has something to add up.
func (s *seeder) seedRegion(ctx context.Context, inc incidentData) error {
	spID, err := defaultSchadenplatz(ctx, s.c, inc.ID, inc.Schadenplaetze)
	if err != nil {
		return err
	}

	var einsatzDivision string

	for _, d := range inc.Divisions {
		if d.Description == "Chef Einsatz" {
			einsatzDivision = d.ID
		}
	}

	msgTime := s.mustAt("07:20")

	msg, err := call[struct {
		CreateMessage id `json:"createMessage"`
	}](ctx, s.c, `mutation($input: CreateMessageInput!) { createMessage(input: $input) { id } }`,
		map[string]any{"input": model.CreateMessageInput{
			IncidentID: inc.ID, Sender: "Feuerwehr Talschaft", SenderDetail: "Kanal 3",
			Receiver: "Führungsorgan Süd", ReceiverDetail: "Kanal 3", Medium: model.MediumRadio, Time: &msgTime,
			Content: "Hangrutsch bei der Talstrasse. 4 Verletzte, 1 Person vermisst. Zug 1 ist im Einsatz.",
		}})
	if err != nil {
		return err
	}

	messageID := msg.CreateMessage.ID
	zug := resourceSeed{
		formation: model.ResourceFormationFw, home: "Talschaft", name: "Zug 1", size: model.ResourceUnitSizeZug,
		personnel: 24, task: "Menschenrettung", alert: "07:20",
		contact: &model.ResourceContactInput{Medium: model.ContactMediumRadio, Detail: "Kanal 3"},
		events:  []resourceEvent{{"ready", "07:25", ""}, {"deploy", "07:30", "Talstrasse"}},
	}

	rid, err := s.alert(ctx, inc.ID, spID, messageID, zug)
	if err != nil {
		return err
	}

	if _, err := call[struct{}](ctx, s.c, `mutation($id: ID!, $msg: ID!, $at: DateTime, $input: CasualtyDeltasInput!) {
		recordCasualties(id: $id, sourceMessageId: $msg, occurredAt: $at, input: $input) { id } }`,
		map[string]any{
			"id": spID, "msg": messageID, "at": msgTime,
			"input": model.CasualtyDeltasInput{Verletzte: 4, Vermisste: 1},
		}); err != nil {
		return err
	}

	_, err = call[struct{}](ctx, s.c, `mutation($id: ID!, $input: TriageMessageInput!) {
		triageMessage(id: $id, input: $input) { id } }`,
		map[string]any{"id": messageID, "input": model.TriageMessageInput{
			Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal,
			DivisionIds: []string{einsatzDivision}, LinkedResourceIds: []string{rid},
		}})

	return err
}

// draw places and changes the map objects of one message on the Nachrichtenkarte and returns how
// many steps it applied. The first step of a feature places it, later steps change it.
func (s *seeder) draw(ctx context.Context, incidentID, layerID, messageID string, number int,
	drawn featuresFile, featureIDs map[string]string,
) (int, error) {
	// On the Nachrichtenkarte the message time applies; the API refuses an explicit effectiveAt.
	change := model.FeatureChangeInput{MessageID: &messageID}
	applied := 0

	for _, f := range drawn.Features {
		for i, st := range f.Steps {
			if st.Message != number {
				continue
			}

			vars := map[string]any{"change": change}
			if len(st.Geometry) > 0 {
				vars["geometry"] = st.Geometry
			}

			if len(st.Properties) > 0 {
				vars["properties"] = st.Properties
			}

			if i == 0 {
				vars["incidentId"], vars["layerId"], vars["clientKey"] = incidentID, layerID, f.Key

				added, err := call[struct {
					AddFeature id `json:"addFeature"`
				}](ctx, s.c, `mutation($incidentId: ID!, $layerId: ID!, $clientKey: String!, $geometry: Geometry,
					$properties: JSONObject, $change: FeatureChangeInput) {
					addFeature(incidentId: $incidentId, layerId: $layerId, clientKey: $clientKey,
						geometry: $geometry, properties: $properties, change: $change) { id } }`, vars)
				if err != nil {
					return applied, fmt.Errorf("feature %s: %w", f.Key, err)
				}

				featureIDs[f.Key] = added.AddFeature.ID
			} else {
				vars["id"] = featureIDs[f.Key]

				if _, err := call[struct{}](ctx, s.c, `mutation($id: ID!, $geometry: Geometry, $properties: JSONObject,
					$change: FeatureChangeInput) {
					modifyFeature(id: $id, geometry: $geometry, properties: $properties, change: $change) { id } }`,
					vars); err != nil {
					return applied, fmt.Errorf("feature %s: %w", f.Key, err)
				}
			}

			applied++
		}
	}

	return applied, nil
}

// alert creates the resource and applies its events with their explicit times.
func (s *seeder) alert(ctx context.Context, incidentID, spID, messageID string, r resourceSeed) (string, error) {
	alertedAt := s.mustAt(r.alert)

	res, err := call[struct {
		AlertResource id `json:"alertResource"`
	}](ctx, s.c, `mutation($input: AlertResourceInput!) { alertResource(input: $input) { id } }`,
		map[string]any{"input": model.AlertResourceInput{
			IncidentID: incidentID, SchadenplatzID: &spID, Formation: r.formation, Name: r.name,
			Size: r.size, PersonnelCount: r.personnel, Hauptaufgabe: r.task, Contact: r.contact,
			HomeLocation:    &model.ResourceHomeLocationInput{Name: r.home},
			SourceMessageID: &messageID, OccurredAt: &alertedAt,
		}})
	if err != nil {
		return "", err
	}

	rid := res.AlertResource.ID

	for _, e := range r.events {
		at := s.mustAt(e.at)

		switch e.action {
		case "ready":
			_, err = call[struct{}](
				ctx,
				s.c,
				`mutation($id: ID!, $at: DateTime) { markResourceReady(id: $id, at: $at) { id } }`,
				map[string]any{"id": rid, "at": at},
			)
		case "deploy":
			if _, err = call[struct{}](ctx, s.c, `mutation($id: ID!, $loc: DeploymentLocationInput, $at: DateTime) {
				updateDeploymentLocation(id: $id, location: $loc, at: $at) { id } }`,
				map[string]any{"id": rid, "loc": model.DeploymentLocationInput{Label: e.place}, "at": at}); err != nil {
				return "", err
			}

			_, err = call[struct{}](
				ctx,
				s.c,
				`mutation($id: ID!, $at: DateTime) { deployResource(id: $id, at: $at) { id } }`,
				map[string]any{"id": rid, "at": at},
			)
		default:
			err = fmt.Errorf("unknown action %q", e.action)
		}

		if err != nil {
			return "", err
		}
	}

	return rid, nil
}
