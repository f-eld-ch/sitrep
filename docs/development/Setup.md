# Local Development Setup


## Prerequisites

### mkcert

1. Install mkcert, follow https://github.com/FiloSottile/mkcert?tab=readme-ov-file#installation

2. Install a root cert
```
mkcert -install
```

3. Generate a local test certificate
```
mkcert -cert-file sitrep.dev.pem -key-file sitrep.dev.key.pem sitrep.dev localhost 127.0.0.1 ::1
```