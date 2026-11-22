import {
  type BabsCategory,
  type BabsCategoryNumber,
  type BabsIconId,
  type BabsIconMeta,
  getGroup,
  getIcon,
  listCategories,
  listIcons,
} from "@f-eld-ch/babs-core";
import { BabsIcon, useBabsLang } from "@f-eld-ch/babs-react";
import { faChevronLeft, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "components/ui";
import { isPickableCategory, isPickableIcon } from "components/babs/excludedIcons";
import { type IconHit, type Range, iconSearch } from "components/babs/iconSearch";
import { resolveIconId } from "components/babs/iconResolver";
import { propertiesWithIcon } from "components/babs/placeIcon";
import {
  CATEGORY_DRILL_DOWN,
  CATEGORY_ICON,
  type DrillDownEntry,
  PICKER_ICON_SIZE,
} from "components/babs/pickerConfig";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { useRecentIcons } from "components/babs/useRecentIcons";
import { PanelShell } from "./PanelShell";

type Point = Feature<Geometry, GeoJsonProperties>;

export interface SymbolPanelProps {
  /** The selected feature; the panel is for points only. */
  feature: Point | undefined;
  onUpdate: (e: { features: Point[]; action: string }) => void;
  /** What to edit once the point has its symbol: the fields, time and save of the feature. */
  form?: React.ReactNode;
  /** Set while the point is not saved yet: offered next to the chooser, where it is dropped. */
  onDiscard?: () => void;
}

const CATEGORIES: readonly BabsCategory[] = listCategories().filter((category) =>
  isPickableCategory(category.number),
);

/** A symbol button of the browser: 35 px like the other map controls, the name on hover and focus. */
const tileClass =
  "inline-flex h-[35px] w-[35px] items-center justify-center rounded border border-gray-300 bg-white p-[2px] hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-primary";

/**
 * Where a symbol is chosen for a point on the map: a search field first, then what was placed
 * last, then the categories to browse.
 *
 * The panel sits under the draw controls. A point that already has a symbol shows only that
 * symbol and a button to change it, so the map keeps its room.
 */
export function SymbolPanel({ feature, onUpdate, form, onDiscard }: SymbolPanelProps) {
  if (feature === undefined || feature.geometry.type !== "Point") return null;

  // Keyed by the feature: selecting another point starts the panel afresh.
  return (
    <Panel
      key={String(feature.id)}
      feature={feature}
      onUpdate={onUpdate}
      form={form}
      onDiscard={onDiscard}
    />
  );
}

type Browse =
  | { category: BabsCategoryNumber; entry?: undefined }
  | { category: BabsCategoryNumber; entry: DrillDownEntry };

function Panel({
  feature,
  onUpdate,
  form,
  onDiscard,
}: {
  feature: Point;
  onUpdate: SymbolPanelProps["onUpdate"];
  form: SymbolPanelProps["form"];
  onDiscard: SymbolPanelProps["onDiscard"];
}) {
  const { t, i18n } = useTranslation();
  const { label: iconLabel } = useBabsLang();
  const catalogueReady = useBabsIcons();
  const { recent, remember } = useRecentIcons();
  const baseId = useId();

  const hasSymbol = Boolean(feature.properties?.icon);
  const [changing, setChanging] = useState(!hasSymbol);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [browse, setBrowse] = useState<Browse | undefined>();
  const [hint, setHint] = useState<string | undefined>();

  const search = useMemo(() => iconSearch(i18n.resolvedLanguage ?? i18n.language), [i18n]);
  const hits = useMemo(() => search(query), [search, query]);
  const searching = query.trim() !== "";

  const place = useCallback(
    (id: BabsIconId) => {
      const meta = getIcon(id);
      onUpdate({
        features: [
          { ...feature, properties: propertiesWithIcon(feature.properties, id, meta.category) },
        ],
        action: "featureDetail",
      });
      remember(id);
      setQuery("");
      setBrowse(undefined);
      setChanging(false);
    },
    [feature, onUpdate, remember],
  );

  // Hold off until the catalogue is registered, so the grid does not flash placeholders.
  if (!catalogueReady) return null;

  const clearSearch = () => {
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((index) => Math.min(index + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      place(hits[active].id);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (searching) clearSearch();
      else if (hasSymbol) setChanging(false);
    }
  };

  const shell = (children: React.ReactNode) => <PanelShell>{children}</PanelShell>;

  // A point that has its symbol: show it, and the way to change it.
  if (hasSymbol && !changing) {
    const current = String(feature.properties?.icon);
    return shell(
      <div className="flex flex-col gap-3">
        <CurrentSymbol icon={current} onChange={() => setChanging(true)} />
        {form}
      </div>,
    );
  }

  const listId = `${baseId}-results`;

  return shell(
    <div className="flex flex-col gap-3">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-8 items-center justify-center text-gray-400">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </span>
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          role="combobox"
          aria-label={t("mapview.iconPicker.search")}
          aria-expanded={searching}
          aria-controls={listId}
          aria-activedescendant={
            searching && hits[active] ? `${baseId}-option-${active}` : undefined
          }
          aria-autocomplete="list"
          className="w-full rounded border border-gray-300 bg-white py-1 pr-7 pl-8 text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          placeholder={t("mapview.iconPicker.placeholder")}
          value={query}
          // Not focused on open: on a touch screen that would raise the keyboard over the map.
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        {query !== "" && (
          <button
            type="button"
            aria-label={t("mapview.iconPicker.clear")}
            className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-gray-500 hover:text-gray-800"
            onClick={clearSearch}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {searching
          ? hits.length > 0
            ? t("mapview.iconPicker.results", { count: hits.length })
            : t("mapview.iconPicker.none", { query: query.trim() })
          : ""}
      </p>

      {searching ? (
        <Results
          id={listId}
          baseId={baseId}
          query={query.trim()}
          hits={hits}
          active={active}
          onHover={setActive}
          onPick={place}
        />
      ) : browse ? (
        <CategoryBrowser
          browse={browse}
          hint={hint}
          iconLabel={iconLabel}
          onHint={setHint}
          onBrowse={setBrowse}
          onPick={place}
        />
      ) : (
        <>
          {recent.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="font-semibold text-gray-800">{t("mapview.iconPicker.recent")}</h3>
              <div className="flex flex-wrap gap-1">
                {recent.map((id) => (
                  <SymbolTile key={id} id={id} label={iconLabel(id)} onPick={place} />
                ))}
              </div>
            </section>
          )}
          <section className="flex flex-col gap-1">
            <h3 className="font-semibold text-gray-800">{t("mapview.iconPicker.categories")}</h3>
            <div className="grid grid-cols-2 gap-1">
              {CATEGORIES.map((category) => (
                <button
                  key={category.number}
                  type="button"
                  className="flex min-h-[40px] items-center gap-2 rounded border border-gray-300 bg-white px-2 py-1 text-left text-[11px] leading-tight hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => setBrowse({ category: category.number })}
                >
                  <BabsIcon
                    icon={CATEGORY_ICON[category.number]}
                    size={28}
                    title=""
                    fallback={null}
                    className="block shrink-0"
                  />
                  <CategoryName category={category} />
                </button>
              ))}
            </div>
          </section>
          <p className="text-[11px] text-gray-600">{t("mapview.iconPicker.hint")}</p>
        </>
      )}
      {hasSymbol && (
        <Button variant="light" size="sm" onClick={() => setChanging(false)}>
          {t("cancel")}
        </Button>
      )}
      {!hasSymbol && onDiscard && (
        <Button variant="light" size="sm" onClick={onDiscard}>
          {t("mapview.pending.discard")}
        </Button>
      )}
    </div>,
  );
}

function CategoryName({ category }: { category: BabsCategory }) {
  const { lang } = useBabsLang();

  return <span>{category.labels[lang]}</span>;
}

function CurrentSymbol({ icon, onChange }: { icon: string; onChange: () => void }) {
  const { t } = useTranslation();
  const { label: iconLabel } = useBabsLang();
  // What is stored is the alias, or an older name: only the catalogue id has a name and artwork.
  const id = resolveIconId(icon);

  return (
    <div className="flex items-center gap-3">
      {id && (
        <BabsIcon
          icon={id}
          size={PICKER_ICON_SIZE}
          title=""
          fallback={null}
          className="block shrink-0"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {id ? iconLabel(id) : ""}
      </span>
      <Button variant="light" size="sm" onClick={onChange}>
        {t("mapview.iconPicker.change")}
      </Button>
    </div>
  );
}

function SymbolTile({
  id,
  label,
  onPick,
}: {
  id: BabsIconId;
  label: string;
  onPick: (id: BabsIconId) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={tileClass}
      onClick={() => onPick(id)}
    >
      <BabsIcon icon={id} size={PICKER_ICON_SIZE} title={label} fallback={null} className="block" />
    </button>
  );
}

function Results({
  id,
  baseId,
  query,
  hits,
  active,
  onHover,
  onPick,
}: {
  id: string;
  baseId: string;
  query: string;
  hits: IconHit[];
  active: number;
  onHover: (index: number) => void;
  onPick: (id: BabsIconId) => void;
}) {
  const { t } = useTranslation();

  if (hits.length === 0) {
    return <p className="text-gray-600">{t("mapview.iconPicker.none", { query })}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-gray-600">{t("mapview.iconPicker.results", { count: hits.length })}</p>
      {/* eslint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- a listbox of rich rows (symbol, highlighted name, path) cannot be a native <select> */}
      <ul id={id} role="listbox" className="flex max-h-[360px] flex-col gap-px overflow-y-auto">
        {hits.map((hit, index) => (
          <li
            key={hit.id}
            id={`${baseId}-option-${index}`}
            role="option"
            aria-selected={index === active}
            className={clsx(
              "flex min-h-[40px] cursor-pointer items-center gap-2 rounded px-2 py-1",
              index === active ? "bg-primary/15 ring-1 ring-primary" : "hover:bg-gray-100",
            )}
            onMouseMove={() => index !== active && onHover(index)}
            onClick={() => onPick(hit.id)}
          >
            <BabsIcon
              icon={hit.id}
              size={PICKER_ICON_SIZE}
              title=""
              fallback={null}
              className="block shrink-0"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs">
                <Highlighted text={hit.label} ranges={hit.labelMatch} />
              </span>
              <span className="truncate text-[11px] text-gray-600">
                <Highlighted text={hit.path} ranges={hit.pathMatch} />
              </span>
            </span>
          </li>
        ))}
      </ul>
      {/* eslint-enable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role */}
    </div>
  );
}

/** The text with the matched stretches marked. */
function Highlighted({ text, ranges }: { text: string; ranges: readonly Range[] }) {
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([from, to], index) => {
    if (from > at) parts.push(text.slice(at, from));
    parts.push(
      <mark key={index} className="rounded-sm bg-yellow-200 font-semibold text-inherit">
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  });
  if (at < text.length) parts.push(text.slice(at));

  return <>{parts}</>;
}

/**
 * One category's symbols. The categories with a drill-down (Formationen) show their selector
 * symbols first, then the group the chosen one opens, as the old picker did.
 */
function CategoryBrowser({
  browse,
  hint,
  iconLabel,
  onHint,
  onBrowse,
  onPick,
}: {
  browse: Browse;
  hint: string | undefined;
  iconLabel: (id: BabsIconId) => string;
  onHint: (hint: string | undefined) => void;
  onBrowse: (browse: Browse | undefined) => void;
  onPick: (id: BabsIconId) => void;
}) {
  const { t } = useTranslation();
  const { lang } = useBabsLang();
  const { category, entry } = browse;
  const drillDown = CATEGORY_DRILL_DOWN[category];
  const pickable = (meta: BabsIconMeta): boolean => isPickableIcon(meta.id);

  const icons = (() => {
    if (!entry) return listIcons({ category }).filter(pickable);
    const group = listIcons({ group: entry.group }).filter(pickable);
    const selector = getIcon(entry.selector);
    // The selector stays placeable: it leads its own group.
    return group.some((meta) => meta.id === selector.id) || !pickable(selector)
      ? group
      : [selector, ...group];
  })();

  const title = listCategories().find((c) => c.number === category)?.labels[lang] ?? "";
  const back = () => onBrowse(drillDown && entry ? { category } : undefined);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t("mapview.back")}
          className={tileClass}
          onClick={() => {
            onHint(undefined);
            back();
          }}
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>

      <div className="flex flex-wrap gap-1">
        {drillDown && !entry
          ? drillDown.map((item) => {
              // The group's name, not the selector symbol's: "Polizei" reads better than "P".
              const name = getGroup(item.group).labels[lang];
              return (
                <button
                  key={item.selector}
                  type="button"
                  title={name}
                  aria-label={name}
                  className={tileClass}
                  onMouseEnter={() => onHint(name)}
                  onMouseLeave={() => onHint(undefined)}
                  onFocus={() => onHint(name)}
                  onBlur={() => onHint(undefined)}
                  onClick={() => {
                    onHint(undefined);
                    onBrowse({ category, entry: item });
                  }}
                >
                  <BabsIcon
                    icon={item.selector}
                    size={PICKER_ICON_SIZE}
                    title={name}
                    fallback={null}
                    className="block"
                  />
                </button>
              );
            })
          : icons.map((meta) => {
              const name = iconLabel(meta.id);
              return (
                <button
                  key={meta.id}
                  type="button"
                  title={name}
                  aria-label={name}
                  className={tileClass}
                  onMouseEnter={() => onHint(name)}
                  onMouseLeave={() => onHint(undefined)}
                  onFocus={() => onHint(name)}
                  onBlur={() => onHint(undefined)}
                  onClick={() => onPick(meta.id)}
                >
                  <BabsIcon
                    icon={meta.id}
                    size={PICKER_ICON_SIZE}
                    title={name}
                    fallback={null}
                    className="block"
                  />
                </button>
              );
            })}
      </div>

      {/* The name of the symbol under the pointer or focus: a tooltip does not exist on touch. */}
      <p className="min-h-[1rem] text-[11px] text-gray-700" aria-hidden="true">
        {hint ?? ""}
      </p>
    </div>
  );
}
