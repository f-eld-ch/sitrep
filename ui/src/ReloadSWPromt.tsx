import { useRegisterSW } from "virtual:pwa-register/react";

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // eslint-disable-next-line prefer-template
      console.log("SW Registered: " + r);
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <>
      {needRefresh && offlineReady && (
        <div className="notification is-info">
          <button className="delete" onClick={close}></button>
          <span>New content available, click on reload button to update.</span>
          <button className="button is-primary is-light" onClick={() => updateServiceWorker(true)}>
            Reload
          </button>
        </div>
      )}
    </>
  );
}

export default ReloadPrompt;
