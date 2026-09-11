import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import type React from "react";

interface MapPanelProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function MapPanel({ title, onClose, children, style }: MapPanelProps) {
  return (
    <nav
      data-theme="light"
      className="maplibregl-ctrl bg-paper text-gray-700 border border-gray-200 rounded shadow-lg self-end overflow-hidden"
      style={{ pointerEvents: "auto", ...style }}
    >
      <div className="flex justify-between items-center px-3 py-2 border-b border-gray-200 text-sm font-semibold">
        <span>{title}</span>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-600 p-1 leading-none"
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
            "px-3 py-2 cursor-pointer border-b-2 border-transparent transition-colors",
            activeTab === tab.key
              ? "bg-primary text-white border-primary"
              : "hover:text-primary hover:bg-primary/10",
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
}

export function MapPanelBlock({
  children,
  active = false,
  column = false,
  className,
}: MapPanelBlockProps) {
  return (
    <div
      className={clsx(
        "flex px-3 py-2 border-b border-gray-200 last:border-b-0 text-xs",
        column ? "flex-col items-start" : "items-center",
        active && "bg-primary/10",
        className,
      )}
    >
      {children}
    </div>
  );
}
