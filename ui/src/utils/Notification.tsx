import classNames from "classnames";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTimeout } from "usehooks-ts";

interface NotificationProps {
  children: React.ReactNode;
  type: NotificationType;
  timeout?: number | null;
}

type NotificationType = "warning" | "info" | "error" | "primary" | "link" | "success";

function Notification({
  type = "info",
  timeout = 5000,
  children,
}: NotificationProps & { timeout?: number }) {
  const [visible, setVisible] = useState(true);
  const hide = () => setVisible(false);
  const { t } = useTranslation();

  useTimeout(hide, timeout);

  const notificationClass = classNames({
    notification: true,
    "is-warning": type === "warning",
    "is-info": type === "info",
    "is-danger": type === "error",
    "is-primary": type === "primary",
    "is-link": type === "link",
    "is-success": type === "success",
  });

  if (!visible) return null;
  return (
    <div className={notificationClass}>
      <button
        type="button"
        className="delete"
        aria-label={t("dismissNotification")}
        onClick={() => setVisible(false)}
      />
      {children}
    </div>
  );
}

export default Notification;
