import classNames from "classnames";
import { memo, useState } from "react";
import { useTimeout } from "usehooks-ts";
interface NotificationProps {
  children: React.ReactNode;
  type: NotificationType;
  timeout: number | null;
}

type NotificationType = "warning" | "info" | "error" | "primary" | "link" | "success";

function Notification(props: NotificationProps) {
  const { type, timeout, children } = props;

  const [visible, setVisible] = useState(true);
  const hide = () => setVisible(false);

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
      <button className="delete" onClick={() => setVisible(false)}></button>
      {children}
    </div>
  );
}

Notification.defaultProps = {
  className: "notification is-info",
  timeout: 5000,
};

export default memo(Notification);
