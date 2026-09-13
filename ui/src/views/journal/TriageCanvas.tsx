import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import { PageTitle } from "components/ui";

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center text-fg-muted">
      <div className="text-center">
        <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 opacity-30" />
        <p className="text-sm">{t("triageCaughtUp")}</p>
      </div>
    </div>
  );
}

export interface TriageCanvasProps {
  children?: React.ReactNode;
}

export function TriageCanvas({ children }: TriageCanvasProps) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col overflow-hidden ml-4">
      <header className="shrink-0 px-5 pt-5 pb-3 border-b border-border">
        <PageTitle level={1}>{t("triageView")}</PageTitle>
      </header>
      {children ?? <EmptyState />}
    </div>
  );
}
