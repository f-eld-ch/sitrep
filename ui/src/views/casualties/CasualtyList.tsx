import { BabsIcon } from "@f-eld-ch/babs-react";
import { useTranslation } from "react-i18next";
import { CASUALTY_CATEGORIES, type CasualtyTotals } from "./categories";

type Props = {
  totals: CasualtyTotals;
  iconsLoaded: boolean;
  /**
   * "compact" is a stacked list (dashboard sidebar), "cards" a responsive KPI grid,
   * "rows" a divided list with the count first.
   */
  variant?: "compact" | "cards" | "rows";
  /** Omit categories whose count is zero; shows a "none" message if nothing is left. */
  hideZero?: boolean;
};

export function CasualtyList({
  totals,
  iconsLoaded,
  variant = "compact",
  hideZero = false,
}: Props) {
  const { t } = useTranslation();
  const categories = hideZero
    ? CASUALTY_CATEGORIES.filter((cat) => totals[cat.key] !== 0)
    : CASUALTY_CATEGORIES;

  if (categories.length === 0) {
    return <p className="text-sm text-fg-muted">{t("casualties.none")}</p>;
  }

  if (variant === "rows") {
    return (
      <div className="divide-y divide-border">
        {categories.map((cat) => (
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

  if (variant === "cards") {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
        {categories.map((cat) => (
          <section key={cat.key} className="rounded border border-border bg-bg-elevated p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-fg-muted">{t(cat.labelKey)}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center">
                  {iconsLoaded ? <BabsIcon icon={cat.babsId} size={30} fallback={null} /> : null}
                </span>
                <p className="text-2xl font-bold text-danger tabular-nums">{totals[cat.key]}</p>
              </div>
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <div
          key={cat.key}
          className="flex items-center gap-2 rounded border border-border px-2 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{t(cat.labelKey)}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="flex h-8 w-8 items-center justify-center">
              {iconsLoaded ? <BabsIcon icon={cat.babsId} size={24} fallback={null} /> : null}
            </span>
            <span className="text-lg font-bold text-danger tabular-nums">{totals[cat.key]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
