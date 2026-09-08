package postgres

import (
	"testing"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"github.com/stretchr/testify/require"
)

func TestPolicyOnlyCasbinModel(t *testing.T) {
	m, err := model.NewModelFromString(policyModel)
	require.NoError(t, err)

	enforcer, err := casbin.NewEnforcer(m)
	require.NoError(t, err)
	_, err = enforcer.AddPolicy("user:one", "incident:test", "incident", "incident.read", "allow")
	require.NoError(t, err)

	allowed, err := enforcer.Enforce("user:one", "incident:test", "incident", "incident.read")
	require.NoError(t, err)
	require.True(t, allowed)
}
