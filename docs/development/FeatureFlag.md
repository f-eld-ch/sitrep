# Feature Flags - Policy and Intended Purposes for Sitrep Development

## Why Feature Flags?
We intend to implement and use Feature Flags to enable continuous development and testing of Sitrep in one branch.
- Use case example: Development & testing of changes to existing features (e.g. a clock for the feed view of the Operation Journal).
- Use case example: A specific feature is requested by an organization, and they will beta-test it. Multiple features might be in development and tested by different users at the same time.
- Use case example: A/B-Testing of UI-components or processes.


## Sitrep Feature Flags Policy:
1. Responsibility for each Feature Flag and adherence to this policy lies with the developer implementing it.
2. Feature Flags shall only be implemented in frontend UI-elements, to enable or disable access to certain functionalities.
3. No Feature Flags must be implemented in back-end code. However, this does not apply to backend API endpoints needed for frontend Feature Flags.
4. A list of all prior and currently active Feature Flags shall be kept in [`ui/features.yaml`](../../ui/features.yaml) (see below) and include at least the following information: intended Use Case, intended life-span, date implemented, date removed, @f-eld-ch/core-development member name.
5. The intended life-span of every Feature Flag must not exceed 3 months as of integration of the Feature Flag. Furthermore, it must be appropriately documented in the code using line comments and in the list (point 4).
6. In case an extension of the life-span is warranted (at least 2 members of the development-team concur), the life-span may be prolonged once by a maximum of 3 months. The extension must be documented in the list (point 4). After this, no further extensions must be made.
7. If a Feature Flag is used for feature testing, the organization/user who requested the feature shall be the early-adopter for said feature. If no request was made, early-adopters are chosen by the development team.
8. When a Feature is released to all users, the corresponding Feature Flag shall be removed within the next 7 days, regardless if the intended life-span is up or not.
9. All members of @f-eld-ch/core-development must at all times have access to all features under Feature Flags irrespective of their status.


## How Feature Flags work

Flags are defined in [`ui/features.yaml`](../../ui/features.yaml) and served by a [Flipt](https://www.flipt.io/)
service. The UI evaluates them through OpenFeature (`ui/src/FeatureFlags.tsx`, Flipt web provider) and reads
them with `useBooleanFlagValue`:

```tsx
const showTasks = useBooleanFlagValue("show-tasks", false);
```

The default (second argument) is what users see if the flag service is unreachable, so it must be the safe
state, normally `false`.

Who gets a flag is decided by **segments** in the same file:

| Segment | Matches |
| --- | --- |
| `Development` | Organisations of the core development team (SHA-256 hash of the domain) |
| `earlyadopter` | Organisations that beta-test new features. Add one with `echo -n "domain.tld.ch" \| shasum -a 256` |
| `SitrepManaged` | Instances run as a managed service (domain suffix `.sitrep.ch`) |

Only hashes of domains are stored in the repository, never the domains themselves.

## Tracking flags (policy point 4)

`ui/features.yaml` is the list of active flags. Put a comment directly above each flag with its intended
use case, the owner and when it is to be removed, for example:

```yaml
  # <owner>: flag for rolling out the review of an incident, remove within 3 months after it is integrated
  - key: incident-review
```

Removed flags disappear from the file; their history is in git (`git log -S'key: <flag>' ui/features.yaml`), which
serves as the record of the dates implemented and removed.

## How to add a new Feature Flag

1. Add the flag, and the segments that should see it, to `ui/features.yaml` following the
   [Flipt documentation](https://docs.flipt.io/), with the tracking comment described above.
2. Open a pull request. CI runs `flipt validate` on the file (the `featureflags` job in
   `.github/workflows/main.yml`).
3. After the pull request is merged to `develop`, CI builds and pushes the feature flag bundle
   (`ghcr.io/f-eld-ch/sitrep/featureflags:develop`), which the Flipt service pulls automatically.
4. Read the flag in the UI with `useBooleanFlagValue`.

This means that if you want to use a new feature flag, create it first, make a PR and only then start the
development works that depend on the feature flag.

## How to remove a Feature Flag

Remove the `useBooleanFlagValue` call (keeping the enabled behaviour) and the flag from
`ui/features.yaml` in the same pull request, within 7 days of releasing the feature to all users
(policy point 8).
