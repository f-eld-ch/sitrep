# gRPC API

## Overview

sitrep's gRPC API serves machine clients. This document specifies how it is reached, how a client authenticates, and its services. Its first service is telemetry ingest, called by the telemetry daemon; what ingest does with the data is described in [Automatic Telemetry Events](Automatic%20Telemetry%20Events.md).

---

## Transport

The gRPC API is served with [Connect](https://connectrpc.com/). By default it runs on the HTTP server's port, alongside the UI and GraphQL. If a separate gRPC port is configured, it runs on its own listener there, with the same TLS certificate.

## Authentication

A client authenticates with a token, sent as `Authorization: Bearer <token>` with every call. Clients are configured in `config.yaml`, each with its name, the SHA-256 of its token, hex-encoded, and the services it may call, by their full protobuf name:

```yaml
grpc:
  clients:
    - name: telemetry-daemon
      token_sha256: 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
      services: [sitrep.telemetry.v1.IngestService]
```

The client's name is the actor on the events its calls write. A call without a valid token is rejected with `UNAUTHENTICATED`, a call to a service the client may not call with `PERMISSION_DENIED`.

Authentication sits behind an interface that resolves a call to a client; the token check is its first implementation.

## Definitions

The protobuf definitions live in `api/proto/`, e.g. `api/proto/sitrep/telemetry/v1/ingest.proto`; the directory follows the package. Go code is generated from them with [Buf](https://buf.build/) via `go generate`, like the GraphQL code from `api/schema.graphql`.

## Services

Calls are unary: one request, one response.

### Telemetry ingest

#### Calls

Package `sitrep.telemetry.v1`, service `IngestService`. The data structures and their fields are defined in [Automatic Telemetry Events](Automatic%20Telemetry%20Events.md#ingesting); field names are used unchanged.

| Call | Request |
|---|---|
| `AnnounceDevice` | `device_id`, `name`, `icon`, `channels` |
| `DeprovisionDevice` | `device_id` |
| `SendSample` | `sample` |

In protobuf:

- `occurred_at` is a `google.protobuf.Timestamp`.
- A label and `metadata` are `map<string, string>`.
- A channel's `type` is an enum: `CHANNEL_TYPE_NUMERIC`, `CHANNEL_TYPE_ENUM`; the zero value `CHANNEL_TYPE_UNSPECIFIED` is invalid.
- A reading's `value` is a `oneof` of `number` (`double`) and `state_id` (`string`).
- Optional fields are `optional`.

#### Acknowledgement

A call succeeds once its effects are stored; responses are empty. A sample, position or reading that ingest drops by one of the rules in [Automatic Telemetry Events](Automatic%20Telemetry%20Events.md#ingesting) is not an error: the call succeeds and the drop is counted. `AnnounceDevice` and `DeprovisionDevice` can be repeated with the same effect.

| Code | When | Retry |
|---|---|---|
| `UNAVAILABLE` | storing failed, e.g. the database is unreachable | yes, with backoff |
| `DEADLINE_EXCEEDED` | the call took too long | yes, with backoff |
| `INVALID_ARGUMENT` | the request violates the field definitions in [Automatic Telemetry Events](Automatic%20Telemetry%20Events.md), e.g. a missing field that is not optional, a `latitude` of 100, or `CHANNEL_TYPE_UNSPECIFIED` | no |
| `UNAUTHENTICATED`, `PERMISSION_DENIED` | see [Authentication](#authentication) | no |

Any other code is not retried.

A retried `SendSample` whose sample was already stored succeeds; the sample is dropped as a duplicate.

---

## Future Work

Client certificates (mTLS) as a second implementation of authentication.

Streaming calls, should a service need them. They can be added as new calls next to the unary ones, without breaking existing clients.
