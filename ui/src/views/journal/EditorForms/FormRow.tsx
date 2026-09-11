import { type ReactNode, useId } from "react";

interface FormRowProps {
  label?: string;
  grouped?: boolean;
  children: (id: string) => ReactNode;
}

export function FormRow({ label, grouped = false, children }: FormRowProps) {
  const id = useId();
  return (
    <div className="flex flex-col xl:flex-row xl:gap-4 items-start mb-3">
      {label === undefined ? (
        <div className="hidden xl:block xl:w-32 xl:shrink-0" />
      ) : (
        <div className="w-full xl:w-32 xl:shrink-0 xl:text-right xl:pt-1.5 mb-1 xl:mb-0">
          <label htmlFor={id} className="text-sm font-bold capitalize">
            {label}
          </label>
        </div>
      )}
      <div className="flex-1 w-full min-w-0">
        <div className={grouped ? "flex flex-col sm:flex-row gap-2" : undefined}>
          {children(id)}
        </div>
      </div>
    </div>
  );
}
