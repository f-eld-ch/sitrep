import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import type React from "react";

interface MapPanelProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function MapPanel({ title, onClose, children, className }: MapPanelProps) {
  return (
    <nav
      data-theme="light"
      className={clsx(
        "maplibregl-ctrl pointer-events-auto self-end overflow-hidden rounded border border-gray-200 bg-paper text-gray-700 shadow-lg",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-sm font-semibold">
        <span>{title}</span>
        <button
          type="button"
          className="p-1 leading-none text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="close"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
      {children}
    </nav>
  );
}

interface MapPanelTabsProps {
  tabs: { key: string; label: string }[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function MapPanelTabs({ tabs, activeTab, onChange }: MapPanelTabsProps) {
  return (
    <div className="flex border-b border-gray-200 text-xs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={clsx(
            "cursor-pointer border-b-2 border-transparent px-3 py-2 transition-colors",
            activeTab === tab.key
              ? "border-primary bg-primary text-white"
              : "hover:bg-primary/10 hover:text-primary",
          )}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface MapPanelBlockProps {
  children: React.ReactNode;
  active?: boolean;
  column?: boolean;
  className?: string;
  onClick?: () => void;
}

export function MapPanelBlock({
  children,
  active = false,
  column = false,
  className,
  onClick,
}: MapPanelBlockProps) {
  return (
    <div
      className={clsx(
        "flex border-b border-gray-200 px-3 py-2 text-xs last:border-b-0",
        column ? "flex-col items-start" : "items-center",
        active && "bg-primary/10",
        onClick && "cursor-pointer hover:bg-gray-100",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
