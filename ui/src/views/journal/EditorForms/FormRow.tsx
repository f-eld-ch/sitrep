import { type ReactNode, useId } from "react";

interface FormRowProps {
  label?: string;
  grouped?: boolean;
  children: (id: string) => ReactNode;
}

export function FormRow({ label, grouped = false, children }: FormRowProps) {
  const id = useId();
  return (
    <div className="mb-3 flex flex-col items-start xl:flex-row xl:gap-4">
      {label === undefined ? (
        <div className="hidden xl:block xl:w-32 xl:shrink-0" />
      ) : (
        <div className="mb-1 w-full xl:mb-0 xl:w-32 xl:shrink-0 xl:pt-1.5 xl:text-right">
          <label htmlFor={id} className="text-sm font-bold capitalize">
            {label}
          </label>
        </div>
      )}
      <div className="w-full min-w-0 flex-1">
        <div className={grouped ? "flex flex-col gap-2 sm:flex-row" : undefined}>
          {children(id)}
        </div>
      </div>
    </div>
  );
}
