package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestObjectForAction(t *testing.T) {
	cases := []struct {
		action string
		want   string
	}{
		{"incident.read", "incident"},
		{"incident.delete", "incident"},
		{"global.admin", "global"},
		{"noDot", "noDot"},
	}

	for _, tc := range cases {
		assert.Equal(t, tc.want, objectForAction(tc.action), "action=%s", tc.action)
	}
}
