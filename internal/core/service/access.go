package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

type AccessService struct {
	tx              outbound.Transactor
	incRepo         outbound.IncidentAccessRepository
	groupRepo       outbound.AccessGroupRepository
	globalRepo      outbound.GlobalAccessRepository
	incidentChecker outbound.IncidentAccessChecker
	globalChecker   outbound.GlobalAccessChecker
	guard           outbound.AccessGuard
	clock           outbound.Clock
	ids             outbound.IDs
	notifier        outbound.EventNotifier
}

func NewAccessService(
	tx outbound.Transactor,
	incRepo outbound.IncidentAccessRepository,
	groupRepo outbound.AccessGroupRepository,
	globalRepo outbound.GlobalAccessRepository,
	incidentChecker outbound.IncidentAccessChecker,
	globalChecker outbound.GlobalAccessChecker,
	guard outbound.AccessGuard,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *AccessService {
	return &AccessService{
		tx:              tx,
		incRepo:         incRepo,
		groupRepo:       groupRepo,
		globalRepo:      globalRepo,
		incidentChecker: incidentChecker,
		globalChecker:   globalChecker,
		guard:           guard,
		clock:           clock,
		ids:             ids,
		notifier:        notifier,
	}
}

func (s *AccessService) GrantIncidentRole(
	ctx context.Context,
	incidentID shared.IncidentID,
	principal access.Principal,
	role access.Role,
	actor identity.Actor,
) error {
	return s.changeIncident(ctx, incidentID, actor, func(a *access.IncidentAccess, at time.Time) error {
		if err := requireIncidentAccess(
			ctx,
			s.incidentChecker,
			actor,
			incidentID,
			access.IncidentManageAccess,
		); err != nil {
			return err
		}
		if role == access.Owner && !a.IsOwner(actor.Sub) {
			return shared.ErrForbidden
		}
		return a.GrantRole(principal, role, actor.Sub, at)
	})
}

func (s *AccessService) RevokeIncidentRole(
	ctx context.Context,
	incidentID shared.IncidentID,
	principal access.Principal,
	role access.Role,
	actor identity.Actor,
) error {
	return s.changeIncident(ctx, incidentID, actor, func(a *access.IncidentAccess, at time.Time) error {
		if err := requireIncidentAccess(
			ctx,
			s.incidentChecker,
			actor,
			incidentID,
			access.IncidentManageAccess,
		); err != nil {
			return err
		}
		if role == access.Owner && !a.IsOwner(actor.Sub) {
			return shared.ErrForbidden
		}
		return a.RevokeRole(principal, role, actor.Sub, at)
	})
}

func (s *AccessService) ChangeIncidentAccessMode(
	ctx context.Context,
	incidentID shared.IncidentID,
	mode access.IncidentMode,
	actor identity.Actor,
) error {
	return s.changeIncident(ctx, incidentID, actor, func(a *access.IncidentAccess, at time.Time) error {
		if err := requireIncidentAccess(
			ctx,
			s.incidentChecker,
			actor,
			incidentID,
			access.IncidentManageAccess,
		); err != nil {
			if !(a.Mode() == access.OpenOperational && mode == access.Restricted && !a.HasDirectUserOwner()) {
				return err
			}
		}
		return a.ChangeAccessMode(mode, actor.Sub, at)
	})
}

func (s *AccessService) CreateAccessGroup(
	ctx context.Context,
	name, description string,
	actor identity.Actor,
) (uuid.UUID, error) {
	if err := s.requireGlobal(ctx, actor, access.GroupManage); err != nil {
		return uuid.Nil, err
	}
	id := s.ids.New()
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		group := access.NewAccessGroup(id)
		if err := group.Create(name, description, actor.Sub, at); err != nil {
			return err
		}
		_, err := s.groupRepo.Save(ctx, group)
		return err
	})
	if err == nil {
		_ = s.notifier.Notify(ctx)
	}
	return id, err
}

func (s *AccessService) RenameAccessGroup(
	ctx context.Context,
	groupID uuid.UUID,
	name string,
	actor identity.Actor,
) error {
	return s.changeGroup(
		ctx,
		groupID,
		actor,
		func(g *access.AccessGroup, at time.Time) error { return g.Rename(name, actor.Sub, at) },
	)
}

func (s *AccessService) ArchiveAccessGroup(ctx context.Context, groupID uuid.UUID, actor identity.Actor) error {
	return s.changeGroup(
		ctx,
		groupID,
		actor,
		func(g *access.AccessGroup, at time.Time) error { return g.Archive(actor.Sub, at) },
	)
}

func (s *AccessService) AddGroupMember(
	ctx context.Context,
	groupID uuid.UUID,
	subject string,
	actor identity.Actor,
) error {
	return s.changeGroup(
		ctx,
		groupID,
		actor,
		func(g *access.AccessGroup, at time.Time) error { return g.AddMember(subject, actor.Sub, at) },
	)
}

func (s *AccessService) RemoveGroupMember(
	ctx context.Context,
	groupID uuid.UUID,
	subject string,
	actor identity.Actor,
) error {
	return s.changeGroup(
		ctx,
		groupID,
		actor,
		func(g *access.AccessGroup, at time.Time) error { return g.RemoveMember(subject, actor.Sub, at) },
	)
}

func (s *AccessService) GrantGlobalRole(
	ctx context.Context,
	subject string,
	role access.GlobalRole,
	actor identity.Actor,
) error {
	if err := s.requireGlobal(ctx, actor, access.SystemAdminManage); err != nil {
		return err
	}
	return s.changeGlobal(
		ctx,
		actor,
		func(g *access.GlobalAccess, at time.Time) error { return g.GrantRole(subject, role, actor.Sub, at) },
	)
}

func (s *AccessService) RevokeGlobalRole(
	ctx context.Context,
	subject string,
	role access.GlobalRole,
	actor identity.Actor,
) error {
	if err := s.requireGlobal(ctx, actor, access.SystemAdminManage); err != nil {
		return err
	}
	return s.changeGlobal(
		ctx,
		actor,
		func(g *access.GlobalAccess, at time.Time) error { return g.RevokeRole(subject, role, actor.Sub, at) },
	)
}

func (s *AccessService) changeIncident(
	ctx context.Context,
	id shared.IncidentID,
	actor identity.Actor,
	fn func(*access.IncidentAccess, time.Time) error,
) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		a, err := s.incRepo.Load(ctx, id)
		if err != nil {
			return err
		}
		if s.guard != nil {
			release, err := s.guard.LockForUpdate(ctx)
			if err != nil {
				return err
			}
			defer release()
		}
		if err := fn(a, at); err != nil {
			return err
		}
		_, err = s.incRepo.Save(ctx, a)
		return err
	})
	if err == nil {
		_ = s.notifier.Notify(ctx)
	}
	return err
}

func (s *AccessService) changeGroup(
	ctx context.Context,
	id uuid.UUID,
	actor identity.Actor,
	fn func(*access.AccessGroup, time.Time) error,
) error {
	if err := s.requireGlobal(ctx, actor, access.GroupManage); err != nil {
		return err
	}
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		g, err := s.groupRepo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := fn(g, at); err != nil {
			return err
		}
		_, err = s.groupRepo.Save(ctx, g)
		return err
	})
	if err == nil {
		_ = s.notifier.Notify(ctx)
	}
	return err
}

func (s *AccessService) changeGlobal(
	ctx context.Context,
	actor identity.Actor,
	fn func(*access.GlobalAccess, time.Time) error,
) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		g, err := s.globalRepo.Load(ctx)
		if err != nil {
			if !errors.Is(err, shared.ErrNotFound) {
				return err
			}
			g = access.NewGlobalAccess()
			if err := g.Initialize(actor.Sub, at); err != nil {
				return err
			}
		}
		if err := fn(g, at); err != nil {
			return err
		}
		_, err = s.globalRepo.Save(ctx, g)
		return err
	})
	if err == nil {
		_ = s.notifier.Notify(ctx)
	}
	return err
}

func (s *AccessService) requireGlobal(ctx context.Context, actor identity.Actor, action access.GlobalAction) error {
	if s.globalChecker == nil {
		return nil
	}
	ok, err := s.globalChecker.Can(ctx, actor.Sub, action)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("%w: global action %s", shared.ErrForbidden, action)
	}
	return nil
}

var _ inbound.AccessService = (*AccessService)(nil)
