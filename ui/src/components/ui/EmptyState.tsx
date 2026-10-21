import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { clsx } from "clsx";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon: IconDefinition;
  title: string;
  hint?: string;
  /** Optional call to action shown below the hint. */
  children?: ReactNode;
  className?: string;
}

/** Placeholder for a view or panel that has nothing to show yet, and says what to do about it. */
export function EmptyState({ icon, title, hint, children, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-bg-elevated px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-3xl text-primary">
        <FontAwesomeIcon icon={icon} />
      </div>
      <p className="text-lg font-bold">{title}</p>
      {hint && <p className="max-w-md text-sm text-fg-muted">{hint}</p>}
      {children}
    </div>
  );
}
