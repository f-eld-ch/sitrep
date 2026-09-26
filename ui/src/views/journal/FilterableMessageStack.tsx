import { clsx } from "clsx";
import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PriorityStatus } from "types";
import type { Message } from "types/journal";
import { UserContext } from "utils";
import { buildMessageList } from "./listUtils";
import type { MessageFilters } from "./listUtils";
import { MessageStack } from "./MessageStack";
import type { MessageStackProps } from "./MessageStack";

interface FilterState {
  untriaged: boolean;
  highPriority: boolean;
  mine: boolean;
}

export interface FilterableMessageStackProps extends Omit<MessageStackProps, "messages"> {
  messages: Message[];
  initialFilters?: Partial<FilterState>;
  enabledFilters?: Partial<Record<keyof FilterState, boolean>>;
  /** Hard filter applied before chip filters — not user-selectable. */
  baseFilter?: Partial<MessageFilters>;
}

function FilterChip({
  label,
  active,
  onToggle,
  activeClassName,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={clsx(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
        active
          ? clsx("border-transparent", activeClassName ?? "bg-primary/15 text-primary")
          : "border-border bg-bg text-fg-muted hover:border-fg-muted/40 hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

export function FilterableMessageStack({
  messages,
  initialFilters,
  enabledFilters,
  baseFilter,
  effectiveId,
  onSelect,
  className,
}: FilterableMessageStackProps) {
  const enabled = { untriaged: true, highPriority: true, mine: true, ...enabledFilters };
  const { t } = useTranslation();
  const { state: userState } = useContext(UserContext);

  const [filters, setFilters] = useState<FilterState>({
    untriaged: false,
    highPriority: false,
    mine: false,
    ...initialFilters,
  });

  const toggle = (key: keyof FilterState) => setFilters((prev) => ({ ...prev, [key]: !prev[key] }));

  const filtered = useMemo(() => {
    const chipFilters: MessageFilters = {
      triage: filters.untriaged ? "untriaged" : "all",
      priority: filters.highPriority ? PriorityStatus.High : "all",
      assignment: "all",
      author: filters.mine ? "me" : "all",
    };
    const effectiveFilters: MessageFilters = { ...chipFilters, ...baseFilter };
    return buildMessageList(messages, effectiveFilters, userState.sub);
  }, [messages, filters, baseFilter, userState.sub]);

  const anyActive = filters.untriaged || filters.highPriority || filters.mine;

  return (
    <div className={clsx("flex flex-col", className)}>
      <MessageStack
        messages={filtered}
        effectiveId={effectiveId}
        onSelect={onSelect}
        className="min-h-0 w-full flex-1 shrink"
      />
      <div
        className={clsx(
          "flex flex-wrap gap-1 px-3 py-1.5",
          anyActive ? "border-t border-border/60" : "border-t border-transparent",
        )}
      >
        {enabled.untriaged && (
          <FilterChip
            label={t("messageStack.filterUntriaged")}
            active={filters.untriaged}
            onToggle={() => toggle("untriaged")}
            activeClassName="bg-warning/15 text-warning-fg border-warning/30"
          />
        )}
        {enabled.highPriority && (
          <FilterChip
            label={t("messageStack.filterKeyMessage")}
            active={filters.highPriority}
            onToggle={() => toggle("highPriority")}
            activeClassName="bg-danger/15 text-danger border-danger/30"
          />
        )}
        {enabled.mine && (
          <FilterChip
            label={t("messageStack.filterMine")}
            active={filters.mine}
            onToggle={() => toggle("mine")}
            activeClassName="bg-primary/15 text-primary border-primary/30"
          />
        )}
      </div>
    </div>
  );
}
