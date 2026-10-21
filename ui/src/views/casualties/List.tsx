import { Spinner } from "components";
import { Button, EmptyState, PageTitle } from "components/ui";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { useIncidentResources } from "api";
import type { SchadenplatzWithResources } from "api";
import { BabsIconProvider } from "@f-eld-ch/babs-react";
import { faArrowsToEye, faPersonFallingBurst } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CasualtyList } from "./CasualtyList";
import { ZERO_CASUALTIES, addCasualties, type CasualtyTotals } from "./categories";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

function sum(sps: SchadenplatzWithResources[]): CasualtyTotals {
  return sps.reduce((acc, sp) => addCasualties(acc, sp.casualties), ZERO_CASUALTIES);
}

function isNonZero(c: CasualtyTotals): boolean {
  return Object.values(c).some((v) => v !== 0);
}

function CasualtySummaryCard({
  totals,
  title,
  iconsLoaded,
}: {
  totals: CasualtyTotals;
  title: string;
  iconsLoaded: boolean;
}) {
  return (
    <div className="rounded border border-border bg-bg-elevated p-4">
      <h3 className="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
      <CasualtyList totals={totals} iconsLoaded={iconsLoaded} variant="rows" />
    </div>
  );
}

function CasualtySpCard({
  sp,
  label,
  iconsLoaded,
}: {
  sp: SchadenplatzWithResources;
  label: string;
  iconsLoaded: boolean;
}) {
  return (
    <div className="rounded border border-border bg-bg-elevated p-4">
      <h3 className="mb-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">{label}</h3>
      <CasualtyList totals={sp.casualties} iconsLoaded={iconsLoaded} variant="rows" />
    </div>
  );
}

export function List() {
  const { incidentId } = useParams();
  const { t, i18n } = useTranslation();
  const result = useIncidentResources(incidentId);
  const iconsLoaded = useBabsIcons();
  const navigate = useNavigate();

  if (result.status === "error") return <p className="p-4 text-red-600">{t("errors.UNKNOWN")}</p>;
  if (result.status === "loading" || !result.data) return <Spinner />;

  const activeSps = result.data.schadenplaetze.filter((sp) => !sp.isMerged);
  const defaultSp = activeSps.find((sp) => sp.isDefault);
  const namedSps = activeSps.filter((sp) => !sp.isDefault);
  const { childIncidents } = result.data;
  // Recorded, not just non-zero: deltas that cancel out still mean casualties were triaged.
  const hasCasualtyRecords =
    result.data.hasCasualtyRecords || childIncidents.some((c) => c.hasCasualtyRecords);
  // The default Schadenplatz only says "not assigned to a place": no point showing it empty, or
  // at all while nothing was recorded.
  const showDefaultSp =
    defaultSp !== undefined && hasCasualtyRecords && isNonZero(defaultSp.casualties);
  const locationSps = showDefaultSp ? [defaultSp, ...namedSps] : namedSps;

  // Grand total: own SPs + all child incidents
  const ownTotals = sum(activeSps);
  const childTotals = childIncidents.reduce(
    (acc, c) => addCasualties(acc, c.casualties),
    ZERO_CASUALTIES,
  );
  const grandTotal = addCasualties(ownTotals, childTotals);

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="space-y-6">
        <PageTitle>{t("casualties.overview")}</PageTitle>

        {hasCasualtyRecords ? (
          <CasualtyList totals={grandTotal} iconsLoaded={iconsLoaded} variant="cards" />
        ) : (
          <EmptyState
            className="mx-auto w-full max-w-lg"
            icon={faPersonFallingBurst}
            title={t("casualties.none")}
            hint={t("casualties.noneHint")}
          >
            {incidentId && (
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate(`/incident/${incidentId}/journal/triage`)}
              >
                <FontAwesomeIcon icon={faArrowsToEye} />
                <span>{t("triageView")}</span>
              </Button>
            )}
          </EmptyState>
        )}

        {/* This incident's own casualty breakdown comes first. */}
        {locationSps.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-fg">{t("casualties.thisIncident")}</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3">
              {locationSps.map((sp) => (
                <CasualtySpCard
                  key={sp.id}
                  sp={sp}
                  label={sp.isDefault ? t("schadenplatz.defaultHint") : sp.name}
                  iconsLoaded={iconsLoaded}
                />
              ))}
            </div>
          </section>
        )}

        {result.data.childIncidents.length > 0 && (
          <section className="space-y-3">
            <h2 className="border-t border-border pt-5 text-base font-bold text-fg">
              {t("casualties.childIncidents")}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3">
              {result.data.childIncidents.map((child) => (
                <CasualtySummaryCard
                  key={child.id}
                  totals={child.casualties}
                  title={child.name}
                  iconsLoaded={iconsLoaded}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </BabsIconProvider>
  );
}
