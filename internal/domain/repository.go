package domain

type IncidentRepository interface {
	Save(order Incident) error
	FindByID(id string) (Incident, error)
}
