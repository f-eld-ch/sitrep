import { Spinner } from "components";
import { Button, Notification, PageTitle, Tag } from "components/ui";
import type { TagVariant } from "components/ui/Tag";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Resource, SchadenplatzWithResources } from "api";
import {
  useDeployResource,
  useIncidentResources,
  useMarkResourceReady,
  useRelieveResource,
  useStandDownResource,
} from "api";
import type { ResourceStatus } from "../../gql/next/graphql";

const statusVariant: Record<ResourceStatus, TagVariant> = {
  AUFGEBOTEN: "warning",
  EINSATZBEREIT: "primary",
  EINGESETZT: "success",
  ABGELOEST: "gray",
};

function ResourceCard({ resource }: { resource: Resource }) {
  const { t } = useTranslation();
  const [markReady, markReadyState] = useMarkResourceReady();
  const [deploy, deployState] = useDeployResource();
  const [standDown, standDownState] = useStandDownResource();
  const [relieve, relieveState] = useRelieveResource();

  const busy =
    markReadyState.loading ||
    deployState.loading ||
    standDownState.loading ||
    relieveState.loading;

  const actionError =
    markReadyState.error ??
    deployState.error ??
    standDownState.error ??
    relieveState.error;

  return (
    <div className="rounded border border-border bg-bg-elevated p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-fg">{resource.name}</p>
          <p className="text-sm text-fg-muted">
            {t(`resource.formation.${resource.formation}`)}
            {" · "}
            {t(`resource.size.${resource.size}`)}
            {" · "}
            {resource.personnelCount} {t("resource.fields.personnelCount")}
          </p>
          {resource.hauptaufgabe && (
            <p className="text-sm text-fg-muted mt-0.5">{resource.hauptaufgabe}</p>
          )}
        </div>
        <Tag variant={statusVariant[resource.status]} light size="sm">
          {t(`resource.status.${resource.status}`)}
        </Tag>
      </div>

      {actionError && (
        <p className="text-xs text-danger">{t(`errors.${actionError.code}`)}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {resource.status === "AUFGEBOTEN" && (
          <Button
            size="xs"
            variant="primary"
            light
            disabled={busy}
            onClick={() => void markReady({ id: resource.id })}
          >
            {t("resource.actions.markReady")}
          </Button>
        )}
        {resource.status === "EINSATZBEREIT" && (
          <Button
            size="xs"
            variant="success"
            light
            disabled={busy}
            onClick={() => void deploy({ id: resource.id })}
          >
            {t("resource.actions.deploy")}
          </Button>
        )}
        {resource.status === "EINGESETZT" && (
          <>
            <Button
              size="xs"
              variant="warning"
              light
              disabled={busy}
              onClick={() => void standDown({ id: resource.id })}
            >
              {t("resource.actions.standDown")}
            </Button>
            <Button
              size="xs"
              variant="light"
              disabled={busy}
              onClick={() => void relieve({ id: resource.id })}
            >
              {t("resource.actions.relieve")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SchadenplatzSection({ sp }: { sp: SchadenplatzWithResources }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wide">
        {sp.name}
        {sp.isDefault && (
          <Tag variant="light" size="sm" className="ml-2 normal-case">
            {t("default")}
          </Tag>
        )}
      </h3>
      {sp.resources.length === 0 ? (
        <p className="text-sm text-fg-muted py-2">{t("resource.noResources")}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sp.resources.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function List() {
  const { incidentId } = useParams();
  const { t } = useTranslation();
  const result = useIncidentResources(incidentId);

  if (result.status === "loading") return <Spinner />;

  if (result.status === "error") {
    return (
      <div>
        <PageTitle>{t("resources")}</PageTitle>
        <Notification variant="danger">{t(`errors.${result.error.code}`)}</Notification>
      </div>
    );
  }

  const { schadenplaetze } = result.data;
  const sorted = [...schadenplaetze].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <PageTitle>{t("resources")}</PageTitle>
      {sorted.map((sp) => (
        <SchadenplatzSection key={sp.id} sp={sp} />
      ))}
    </div>
  );
}

export default List;
