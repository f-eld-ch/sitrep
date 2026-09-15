import { faHome, faRotateRight, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Navbar } from "components";
import { Button } from "components/ui";
import { useTranslation } from "react-i18next";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";

export function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();

  let status: number | undefined;
  let statusText: string;
  let detail: string;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    statusText = error.statusText || String(error.status);
    detail = error.data || t("errorPage.unknown");
  } else if (error instanceof Error) {
    statusText = error.name;
    detail = error.message;
  } else {
    statusText = t("errorPage.title");
    detail = t("errorPage.unknown");
  }

  const isNotFound = status === 404;
  const incidentTitle = isNotFound ? t("errorPage.notFoundTitle") : t("errorPage.title");
  const incidentDesc = isNotFound ? t("errorPage.notFoundDesc") : detail;
  const now = new Date().toLocaleString();

  return (
    <>
      <Navbar />
      <div className="mt-[2.75rem] flex min-h-[calc(100vh-2.75rem)] flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Incident report header */}
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fg-muted">
            <FontAwesomeIcon icon={faTriangleExclamation} className="text-danger" />
            <span>{t("keyMessage")}</span>
            {status && (
              <span className="ml-auto font-mono text-fg-muted/50">#{status}</span>
            )}
          </div>

          {/* Report card */}
          <div className="rounded-xl border border-border bg-bg-elevated shadow-xl">
            {/* Status bar */}
            <div className="flex items-center gap-3 rounded-t-xl border-b border-border bg-danger/10 px-5 py-3">
              <span className="text-xs font-bold uppercase text-danger">
                {t("errorPage.priority")}: {t("errorPage.priorityHigh")}
              </span>
              <span className="ml-auto text-xs text-fg-muted">{now}</span>
            </div>

            <div className="p-6">
              {/* Title */}
              <h1 className="mb-1 text-2xl font-bold">{incidentTitle}</h1>
              <p className="mb-5 text-sm text-fg-muted">{incidentDesc}</p>

              {/* Report fields */}
              <dl className="mb-6 space-y-2 rounded-lg border border-border bg-bg p-4 text-sm">
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 font-bold text-fg-muted">{t("errorPage.fieldLocation")}</dt>
                  <dd className="font-mono text-fg">{window.location.pathname}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 font-bold text-fg-muted">{t("errorPage.fieldStatus")}</dt>
                  <dd className="font-mono text-fg">{statusText}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 font-bold text-fg-muted">{t("errorPage.fieldAction")}</dt>
                  <dd className="text-fg">{t("errorPage.fieldActionValue")}</dd>
                </div>
              </dl>

              {/* Actions */}
              <div className="flex gap-3">
                <Button type="button" variant="light" onClick={() => navigate(-1)}>
                  <FontAwesomeIcon icon={faRotateRight} />
                  <span>{t("errorPage.goBack")}</span>
                </Button>
                <Button type="button" variant="primary" onClick={() => navigate("/")}>
                  <FontAwesomeIcon icon={faHome} />
                  <span>{t("errorPage.goHome")}</span>
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-fg-muted/50">{t("errorPage.footer")}</p>
        </div>
      </div>
    </>
  );
}
