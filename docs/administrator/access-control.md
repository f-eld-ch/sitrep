# Access Control

SitRep has two levels of access control: **global roles** that govern who can administrate the system, and **incident roles** that govern who can see and act on a specific incident.

---

## Global Roles

Global roles apply across the entire SitRep installation. There are two:

| Role | What they can do |
|---|---|
| **System admin** | Manage groups, manage group membership, grant and revoke all global roles (including other system admins) |
| **Group admin** | Manage groups and group membership — cannot promote or demote admins |

Global roles are managed in **Administration → Access control → Global roles**.

### Granting a global role

1. Open **Administration → Access control → Global roles**.
2. Under **Grant a role**, select the user from the dropdown and choose either **Group admin** or **System admin**.
3. Click **Grant**.

The user is listed immediately under **Current holders**.

### Revoking a global role

1. Find the user under **Current holders**.
2. Click **Revoke** next to their entry and confirm.

> **Note:** The last remaining system admin cannot be revoked. Promote another user to system admin first before removing the current one.

### First system admin (new installations)

On a fresh installation with no users, SitRep automatically grants the first user who signs in the system admin role. On an existing deployment you must use the CLI:

```bash
sitrep admin grant-system-admin <oidc-subject>
```

---

## Groups

Groups let you manage access for a set of users in one place. Grant a group a role on an incident and every member of the group inherits that role automatically. When membership changes, permissions update immediately.

Groups are managed in **Administration → Access control → Groups**.

### Creating a group

1. Click **New group**.
2. Enter a name (required) and an optional short description of the group's purpose.
3. Click **Create**.

### Adding members

1. Open the group by clicking its name.
2. Under **Add members**, search for a user by name, email, or subject identifier.
3. Check the users to add and click **Add**.

### Removing members

1. Open the group.
2. Click the remove icon next to a member's name.

### Archiving a group

An archived group is read-only and cannot receive new incident access grants. Existing grants referencing the group are automatically excluded from access decisions once the group is archived.

> A group cannot be archived while it is actively referenced by incident access grants. Remove the grants first, then archive the group.

1. Open the group.
2. Click **Archive group** and confirm.

---

## Incident Roles

Every user who can interact with an incident holds one of the following roles:

| Role | Can do |
|---|---|
| **Viewer** | Read the incident, view the journal and situation map |
| **Editor** | Everything a Viewer can do, plus post journal entries, edit the situation map, and link/unlink parent incidents |
| **Manager** | Everything an Editor can do, plus close/reopen the incident and manage who has access |
| **Owner** | Everything a Manager can do, plus **delete** the incident |

> **Note on open incidents:** On open access incidents, every authenticated user can do everything a Manager can do — view, edit, close, and manage access grants. Only **delete** remains restricted to the Owner, even on open incidents.

A principal (user, group, or "all users") holds exactly one role per incident. Granting a new role replaces the old one automatically.

---

## Incident Access Modes

Each incident has an **access mode** that determines the default visibility:

| Mode | Who can access the incident |
|---|---|
| **Open access** | Every authenticated SitRep user can view, edit, close, and manage access grants on the incident. Only **deleting** the incident is restricted to the Owner. |
| **Restricted** | Only users (or group members) with an explicit grant can view or interact with the incident. Role permissions apply in full. |

New incidents are created in **Open access** mode. Switch to **Restricted** when the incident contains sensitive information or when you want to control exactly who participates.

> **Warning:** Switching to Restricted removes access for anyone without an explicit grant. SitRep shows a confirmation prompt listing this consequence before applying the change.

---

## Managing Incident Access

Open the **Access** tab on any incident (or navigate directly to `/incident/<id>/access`). On open access incidents, any authenticated user can see and change the access settings. On restricted incidents, you must hold the **Manager** or **Owner** role.

### Switching access mode

Under **Access mode**, select either **Open access** or **Restricted** and confirm if prompted.

### Granting access

1. Under **Add grant**, choose whether to grant access to a **Group** or a **User**.
2. Search for the group or user by name.
3. Select the role from the dropdown (**Viewer**, **Editor**, **Manager**, or **Owner**).
4. Click **Grant**.

The new grant appears in the table immediately.

**Granting all users:** Select the **All users** row in the grants table and assign a role. This gives every authenticated user at least Viewer or Editor access, regardless of whether they are individually listed.

### Changing a role

In the grants table, click the role dropdown next to the principal's name and select the new role. The change is applied immediately.

### Revoking access

Click **Revoke** next to a grant to remove it. If the incident is in Restricted mode, the user (or group members) will lose access immediately.

> The last Owner cannot be revoked. Assign the Owner role to another user first.

---

## Interaction Between Groups and Incidents

- Granting a **group** a role on an incident gives every current and future group member that role.
- Removing a user from a group removes their group-derived access. If they also have a direct user grant, that grant still applies.
- Archiving a group removes its access contribution from all incidents. Individual grants made directly to users are not affected.

---

## Summary: Who Can Do What

The table below shows permissions for **restricted** incidents. On **open access** incidents, all users effectively have Manager-level permissions — except delete, which is always Owner-only.

| Action | Viewer | Editor | Manager | Owner | Group admin | System admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View incident and journal | ✓ | ✓ | ✓ | ✓ | | |
| Post / edit journal entries | | ✓ | ✓ | ✓ | | |
| Edit situation map | | ✓ | ✓ | ✓ | | |
| Close / reopen incident | | | ✓ | ✓ | | |
| Manage incident access | | | ✓ | ✓ | | |
| Link / unlink sub-incidents | | ✓ | ✓ | ✓ | | |
| Delete incident | | | | ✓ | | |
| Create / archive groups | | | | | ✓ | ✓ |
| Manage group membership | | | | | ✓ | ✓ |
| Grant / revoke global roles | | | | | | ✓ |
