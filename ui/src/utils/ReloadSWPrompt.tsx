import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "i18next";

const intervalMS = 60 * 60 * 1000;

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // eslint-disable-next-line prefer-template
      console.log("SW Registered: " + r);
      r &&
        setInterval(() => {
          r.update();
        }, intervalMS);
      setOfflineReady(true);
    },
    onRegisterError(error) {
      console.log("SW registration error:", error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <>
      {needRefresh && offlineReady && (
        <div className="container is-fluid mt-2 pt-4">
          <div className="notification is-danger  mt-2">
            <button className="delete" onClick={close}></button>
            <span>{t("updateNotification")}</span>
            <button className="button is-danger is-light is-small ml-2" onClick={() => updateServiceWorker(true)}>
              Reload
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default ReloadPrompt;
