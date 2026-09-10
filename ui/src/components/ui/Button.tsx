import classNames from "classnames";
import { type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "success" | "warning" | "danger" | "light" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  light?: boolean;
  rounded?: boolean;
  fullWidth?: boolean;
  capitalized?: boolean;
  selected?: boolean;
  invisible?: boolean;
}

const base =
  "inline-flex items-center justify-center cursor-pointer border font-medium transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const sizes: Record<ButtonSize, string> = {
  sm: "text-sm px-3 py-1 h-7",
  md: "text-base px-4 py-2 h-9",
  lg: "text-lg px-6 py-3 h-12",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white border-transparent hover:bg-interactive-hover active:bg-interactive-pressed",
  success: "bg-success text-white border-transparent hover:opacity-90",
  warning: "bg-warning text-ink border-transparent hover:opacity-90",
  danger: "bg-danger text-white border-transparent hover:opacity-90",
  light: "bg-bg-subtle text-fg border-border hover:bg-border",
  ghost: "bg-transparent border-transparent text-fg-muted hover:bg-bg-subtle",
};

const lightVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary/15 text-primary border-transparent hover:bg-primary/25",
  success: "bg-success/15 text-success border-transparent hover:bg-success/25",
  warning: "bg-warning/20 text-ink dark:text-warning border-transparent hover:bg-warning/30",
  danger: "bg-danger/15 text-danger border-transparent hover:bg-danger/25",
  light: "bg-bg-subtle text-fg border-border hover:bg-border",
  ghost: "bg-transparent border-transparent text-fg-muted hover:bg-bg-subtle",
};

export function Button({
  variant = "light",
  size = "sm",
  light = false,
  rounded = false,
  fullWidth = false,
  capitalized = false,
  selected = false,
  invisible = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(
        base,
        sizes[size],
        light ? lightVariants[variant] : variants[variant],
        rounded ? "rounded-full" : "rounded",
        {
          "w-full": fullWidth,
          capitalize: capitalized,
          "ring-2 ring-inset ring-current": selected,
          invisible: invisible,
        },
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
