import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useChangeIncidentAccessMode, useIncidentAccessMode, useIncidentDetails } from "api";
import { IncidentForm } from "./New";

function Editor() {
  const { incidentId } = useParams();
  const { t } = useTranslation();

  const result = useIncidentDetails(incidentId);
  const modeResult = useIncidentAccessMode(incidentId);
  const [changeMode, modeState] = useChangeIncidentAccessMode();

  if (result.status === "error") {
    return <div className="notification is-danger">{t(`errors.${result.error.code}`)}</div>;
  }

  if (result.status === "loading") return <Spinner />;

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t("editIncident")}</h3>
      {modeResult.status === "ready" && incidentId && (
        <div className="box">
          <div className="level">
            <div>
              <p className="heading">Access mode</p>
              <p className="title is-5">
                {modeResult.data.mode === "RESTRICTED" ? "Restricted" : "Open operational"}
              </p>
            </div>
            <button
              type="button"
              className={`button ${modeResult.data.mode === "RESTRICTED" ? "is-warning" : "is-danger"}`}
              disabled={modeState.loading}
              onClick={() => {
                const nextMode =
                  modeResult.data.mode === "RESTRICTED" ? "OPEN_OPERATIONAL" : "RESTRICTED";
                if (
                  nextMode === "RESTRICTED" &&
                  !window.confirm(
                    "Restrict this incident? Users without an explicit grant will lose access.",
                  )
                )
                  return;
                void changeMode({ incidentId, mode: nextMode }).then(modeResult.refresh);
              }}
            >
              {modeState.loading
                ? "Saving..."
                : modeResult.data.mode === "RESTRICTED"
                  ? "Open incident"
                  : "Restrict incident"}
            </button>
          </div>
          {modeState.error && (
            <div className="notification is-danger">{modeState.error.message}</div>
          )}
        </div>
      )}
      <div className="box">
        <IncidentForm incident={result.data.incident} />
      </div>
    </>
  );
}

export default Editor;
