// Package scalar provides custom GraphQL scalar implementations.
package scalar

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/99designs/gqlgen/graphql"
)

// JSONMap is the Go representation of the Geometry and JSONObject scalars.
// It marshals to/from JSON transparently.
type JSONMap map[string]any

func MarshalJSONMap(m JSONMap) graphql.Marshaler {
	return graphql.WriterFunc(func(w io.Writer) {
		data, err := json.Marshal(m)
		if err != nil {
			_, _ = fmt.Fprintf(w, "null")
			return
		}

		_, _ = w.Write(data)
	})
}

func UnmarshalJSONMap(v any) (JSONMap, error) {
	switch t := v.(type) {
	case map[string]any:
		return JSONMap(t), nil
	case string:
		var m JSONMap
		if err := json.Unmarshal([]byte(t), &m); err != nil {
			return nil, fmt.Errorf("JSONMap: cannot unmarshal string: %w", err)
		}

		return m, nil
	default:
		return nil, fmt.Errorf("JSONMap: expected map[string]any, got %T", v)
	}
}
