import { faCheckCircle, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import { PageTitle } from "components/ui";

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center text-success">
      <div className="text-center">
        <FontAwesomeIcon icon={faCheckCircle} className="mb-3 text-5xl" />
        <p className="text-lg font-bold">{t("triageCaughtUp")}</p>
      </div>
    </div>
  );
}

function ClosedWarning() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <FontAwesomeIcon icon={faTriangleExclamation} className="mb-3 text-5xl text-danger" />
        <p className="text-lg font-bold text-danger">{t("triageIncidentClosed")}</p>
      </div>
    </div>
  );
}

export interface TriageCanvasProps {
  children?: React.ReactNode;
  incidentClosed?: boolean;
}

export function TriageCanvas({ children, incidentClosed = false }: TriageCanvasProps) {
  const { t } = useTranslation();
  return (
    <div className="ml-4 flex flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border px-5 pt-5 pb-3">
        <PageTitle level={1}>{t("triageView")}</PageTitle>
      </header>
      {incidentClosed ? <ClosedWarning /> : (children ?? <EmptyState />)}
    </div>
  );
}
