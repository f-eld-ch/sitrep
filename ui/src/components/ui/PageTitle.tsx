import classNames from "classnames";
import { type ReactNode } from "react";

type Level = 1 | 2 | 3;

const TAG: Record<Level, "h1" | "h2" | "h3"> = { 1: "h1", 2: "h2", 3: "h3" };

const SIZE: Record<Level, string> = {
  1: "text-3xl",
  2: "text-2xl",
  3: "text-xl",
};

interface PageTitleProps {
  children: ReactNode;
  level?: Level;
  className?: string;
}

export function PageTitle({ children, level = 1, className }: PageTitleProps) {
  const Tag = TAG[level];
  return (
    <Tag className={classNames("font-bold capitalize mb-5", SIZE[level], className)}>
      {children}
    </Tag>
  );
}
