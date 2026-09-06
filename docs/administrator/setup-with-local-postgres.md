# SitRep Administrator Guide: Installation & Setup with Local PostgreSQL

This guide walks system administrators through installing SitRep on **Fedora / RHEL** or **Debian / Ubuntu** systems using official package repositories from [packages.sitrep.ch](https://packages.sitrep.ch), setting up a local PostgreSQL database, configuring SitRep, and running the systemd service.

---

## 1. Package Installation

SitRep distributes official APT and RPM packages signed with GPG key fingerprint `5082 9DB2 FE3D 96B9 F544 7FA2 3B5D 817E F801 41FA`.

### Fedora / RHEL / Rocky Linux / AlmaLinux (RPM)

1. Add the official SitRep RPM repository:
   ```bash
   sudo dnf config-manager addrepo --from-repofile=https://packages.sitrep.ch/rpm/sitrep.repo
   ```

2. Install the `sitrep` package:
   ```bash
   sudo dnf install sitrep
   ```

*(Optional)* To opt into the testing/pre-release channel:
```bash
sudo dnf config-manager addrepo --from-repofile=https://packages.sitrep.ch/rpm/sitrep-testing.repo
```

---

### Debian / Ubuntu (DEB)

1. Import the GPG signing key:
   ```bash
   curl -fsSL https://packages.sitrep.ch/sitrep-signing.asc \
     | sudo gpg --dearmor -o /usr/share/keyrings/sitrep.gpg
   ```

2. Add the repository source and install the `sitrep` package:
   ```bash
   sudo curl -fsSL https://packages.sitrep.ch/deb/sitrep.sources \
     -o /etc/apt/sources.list.d/sitrep.sources
   sudo apt-get update
   sudo apt-get install sitrep
   ```

*(Optional)* To opt into the testing/pre-release channel:
```bash
sudo curl -fsSL https://packages.sitrep.ch/deb/sitrep-testing.sources \
  -o /etc/apt/sources.list.d/sitrep-testing.sources
sudo apt-get update
```

---

## 2. Local PostgreSQL Setup

SitRep requires a PostgreSQL database to store event streams and read-model projections.

### Install & Start PostgreSQL Server

#### On Fedora / RHEL / Rocky / AlmaLinux:
```bash
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

#### On Debian / Ubuntu:
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

---

### Create Database & Role

Create a dedicated database user `sitrep` and database `sitrep`:

1. Create the database role:
   ```bash
   sudo -u postgres createuser sitrep
   ```

2. Create the database owned by `sitrep`:
   ```bash
   sudo -u postgres createdb --owner=sitrep sitrep
   ```

---

## 3. Configuration (`/etc/sitrep/config.yaml`)

The package places a default configuration file at `/etc/sitrep/config.yaml` (see [packaging/config.yaml](packaging/config.yaml) for full configuration reference).

### Configure Database Connection

Configure `database-url` in `/etc/sitrep/config.yaml`:

```yaml
database-url: "postgres://sitrep@/sitrep?host=/var/run/postgresql"
```

> **Note on Unix Sockets & Peer/Ident Authentication**:
> This setup connects over PostgreSQL's local Unix domain socket (`/var/run/postgresql`) and relies on PostgreSQL's native **`peer` / `ident` authentication** (`local` rules in `pg_hba.conf`).
>
> By connecting over the Unix socket as role `sitrep`, PostgreSQL validates the connecting OS process user identity directly against the database role. This eliminates the need to store passwords or cleartext database credentials in `/etc/sitrep/config.yaml`.

### Additional Key Configurations

1. **Session Cookie Key**: Generate a 32-byte secret key for signing session cookies:
   ```bash
   openssl rand -base64 32
   ```
   Set the result in `/etc/sitrep/config.yaml`:
   ```yaml
   cookie-key: "YOUR_GENERATED_SECRET_KEY"
   ```

2. **OIDC Authentication (Production)**: Configure your OpenID Connect provider details:
   ```yaml
   oidc-issuer: "https://id.example.org"
   oidc-client-id: "sitrep"
   oidc-client-secret: "YOUR_OIDC_CLIENT_SECRET"
   oidc-redirect-url: "https://sitrep.example.org/oauth2/callback"
   ```

---

## 4. Service Management

The `sitrep` package installs a hardened systemd service ([packaging/sitrep.service](packaging/sitrep.service)).

### Automatic Migrations

The systemd unit includes an `ExecStartPre` hook that automatically runs `sitrep migrate up` before starting the server process. Schema migrations are applied seamlessly whenever the package is installed or upgraded.

### Systemd Commands

- **Enable and start the service**:
  ```bash
  sudo systemctl enable --now sitrep
  ```

- **Check service status**:
  ```bash
  sudo systemctl status sitrep
  ```

- **View application logs**:
  ```bash
  sudo journalctl -u sitrep -f
  ```

- **Restart after configuration changes**:
  ```bash
  sudo systemctl restart sitrep
  ```