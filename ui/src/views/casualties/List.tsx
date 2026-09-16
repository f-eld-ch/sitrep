import { Spinner } from "components";
import { PageTitle } from "components/ui";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { useIncidentResources } from "api";
import type { SchadenplatzWithResources } from "api";
import { BabsIcon, BabsIconProvider } from "@f-eld-ch/babs-react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";

type CasualtyTotals = {
  vermisste: number;
  tote: number;
  verletzte: number;
  obdachlose: number;
  eingeschlossene: number;
};

type CasualtyCategory = {
  key: keyof CasualtyTotals;
  labelKey: string;
  babsId: string;
};

const CATEGORIES: CasualtyCategory[] = [
  { key: "tote", labelKey: "casualties.tote", babsId: "1305" },
  { key: "verletzte", labelKey: "casualties.verletzte", babsId: "1301" },
  { key: "vermisste", labelKey: "casualties.vermisste", babsId: "1302" },
  { key: "eingeschlossene", labelKey: "casualties.eingeschlossene", babsId: "1304" },
  { key: "obdachlose", labelKey: "casualties.obdachlose", babsId: "1303" },
];

const ZERO: CasualtyTotals = {
  vermisste: 0,
  tote: 0,
  verletzte: 0,
  obdachlose: 0,
  eingeschlossene: 0,
};

function add(a: CasualtyTotals, b: CasualtyTotals): CasualtyTotals {
  return {
    vermisste: a.vermisste + b.vermisste,
    tote: a.tote + b.tote,
    verletzte: a.verletzte + b.verletzte,
    obdachlose: a.obdachlose + b.obdachlose,
    eingeschlossene: a.eingeschlossene + b.eingeschlossene,
  };
}

function sum(sps: SchadenplatzWithResources[]): CasualtyTotals {
  return sps.reduce((acc, sp) => add(acc, sp.casualties), ZERO);
}

function isNonZero(c: CasualtyTotals): boolean {
  return Object.values(c).some((v) => v !== 0);
}

function CasualtyRows({ totals, iconsLoaded }: { totals: CasualtyTotals; iconsLoaded: boolean }) {
  const { t } = useTranslation();
  const visible = CATEGORIES.filter((cat) => totals[cat.key] !== 0);

  if (visible.length === 0) {
    return <p className="text-sm text-fg-muted">{t("casualties.none")}</p>;
  }

  return (
    <div className="divide-y divide-border">
      {visible.map((cat) => (
        <div key={cat.key} className="flex items-center gap-2 py-1">
          <div className="flex items-center gap-1">
            {iconsLoaded ? <BabsIcon icon={cat.babsId} size={20} fallback={null} /> : null}
            <span className="w-6 text-right text-base font-bold text-danger tabular-nums">
              {totals[cat.key]}
            </span>
          </div>
          <span className="ml-2 text-sm text-fg-muted">{t(cat.labelKey)}</span>
        </div>
      ))}
    </div>
  );
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
      <CasualtyRows totals={totals} iconsLoaded={iconsLoaded} />
    </div>
  );
}

function CasualtyKpis({ totals, iconsLoaded }: { totals: CasualtyTotals; iconsLoaded: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
      {CATEGORIES.map((cat) => (
        <section key={cat.key} className="rounded border border-border bg-bg-elevated p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-bg">
              {iconsLoaded ? <BabsIcon icon={cat.babsId} size={30} fallback={null} /> : null}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-fg-muted">{t(cat.labelKey)}</h2>
              <p className="text-2xl font-bold text-danger tabular-nums">{totals[cat.key]}</p>
            </div>
          </div>
        </section>
      ))}
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
      <CasualtyRows totals={sp.casualties} iconsLoaded={iconsLoaded} />
    </div>
  );
}

export function List() {
  const { incidentId } = useParams();
  const { t, i18n } = useTranslation();
  const result = useIncidentResources(incidentId);
  const iconsLoaded = useBabsIcons();

  if (result.status === "loading" || !result.data) return <Spinner />;

  const activeSps = result.data.schadenplaetze.filter((sp) => !sp.isMerged);
  const defaultSp = activeSps.find((sp) => sp.isDefault);
  const namedSps = activeSps.filter((sp) => !sp.isDefault);
  const locationSps = defaultSp ? [defaultSp, ...namedSps] : namedSps;
  const { childIncidents } = result.data;

  // Grand total: own SPs + all child incidents
  const ownTotals = sum(activeSps);
  const childTotals = childIncidents.reduce((acc, c) => add(acc, c.casualties), ZERO);
  const grandTotal = add(ownTotals, childTotals);

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="space-y-6">
        <PageTitle>{t("casualties.overview")}</PageTitle>

        <CasualtyKpis totals={grandTotal} iconsLoaded={iconsLoaded} />

        {result.data.childIncidents.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-fg">{t("casualties.childIncidents")}</h2>
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

        {/* Per-SP breakdown — only shown when named SPs exist */}
        {namedSps.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-fg">{t("casualties.byLocation")}</h2>
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

        {/* When no named SPs, show default only if it has data */}
        {namedSps.length === 0 && defaultSp && isNonZero(defaultSp.casualties) && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-fg">{t("casualties.byLocation")}</h2>
            <CasualtySpCard
              sp={defaultSp}
              label={t("schadenplatz.defaultHint")}
              iconsLoaded={iconsLoaded}
            />
          </section>
        )}
      </div>
    </BabsIconProvider>
  );
}
