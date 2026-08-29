import { type ReactNode, useId } from "react";

interface FormRowProps {
  label?: string;
  grouped?: boolean;
  children: (id: string) => ReactNode;
}

export function FormRow({ label, grouped = false, children }: FormRowProps) {
  const id = useId();
  return (
    <div className="field is-horizontal">
      {label === undefined ? (
        <div className="field-label" />
      ) : (
        <div className="field-label is-normal is-flex-shrink-0">
          <label htmlFor={id} className="label is-capitalized">
            {label}
          </label>
        </div>
      )}
      <div className="field-body">
        <div className={grouped ? "field is-grouped is-grouped-multiline" : "field"}>
          {children(id)}
        </div>
      </div>
    </div>
  );
}
