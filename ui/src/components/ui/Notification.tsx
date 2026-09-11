import { clsx } from "clsx";
import { type HTMLAttributes } from "react";

export type NotificationVariant = "danger" | "warning" | "success" | "info";

export interface NotificationProps extends HTMLAttributes<HTMLElement> {
  variant: NotificationVariant;
  light?: boolean;
  as?: "div" | "output" | "p";
}

const variants: Record<NotificationVariant, string> = {
  danger: "bg-danger text-white",
  warning: "bg-warning text-ink",
  success: "bg-success text-white",
  info: "bg-info text-white",
};

const lightVariants: Record<NotificationVariant, string> = {
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/20 text-ink dark:text-warning",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
};

export function Notification({
  variant,
  light = false,
  as: Tag = "div",
  className,
  children,
  ...props
}: NotificationProps) {
  return (
    <Tag
      className={clsx(
        "rounded px-4 py-3 text-sm",
        light ? lightVariants[variant] : variants[variant],
        className,
      )}
      {...(props as object)}
    >
      {children}
    </Tag>
  );
}
