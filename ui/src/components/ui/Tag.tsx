import classNames from "classnames";
import { type AnchorHTMLAttributes, type HTMLAttributes } from "react";

export type TagVariant = "primary" | "success" | "warning" | "danger" | "light" | "gray";

type SpanProps = { as?: "span" } & HTMLAttributes<HTMLSpanElement>;
type AnchorProps = { as: "a" } & AnchorHTMLAttributes<HTMLAnchorElement>;
export type TagProps = (SpanProps | AnchorProps) & {
  variant?: TagVariant;
  light?: boolean;
  size?: "sm" | "md";
};

const variants: Record<TagVariant, string> = {
  primary: "bg-primary text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-ink",
  danger: "bg-danger text-white",
  light: "bg-bg-subtle text-fg-muted",
  gray: "bg-dark-elevated text-white",
};

const lightVariants: Record<TagVariant, string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-ink dark:text-warning",
  danger: "bg-danger/15 text-danger",
  light: "bg-bg-subtle text-fg-muted",
  gray: "bg-disabled/30 text-fg-muted",
};

export function Tag({ variant = "light", light = false, size = "md", className, children, ...props }: TagProps) {
  const Tag = (props as AnchorProps).as ?? "span";
  const colorClass = light ? lightVariants[variant] : variants[variant];
  const sizeClass = size === "sm" ? "text-xs px-1 py-0.5" : "text-sm px-2 py-0.5";

  return (
    <Tag
      className={classNames("inline-flex items-center rounded font-medium", sizeClass, colorClass, className)}
      {...(props as object)}
    >
      {children}
    </Tag>
  );
}
