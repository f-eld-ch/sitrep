import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const useDate = () => {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1 * 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const date = dayjs(now).locale(i18n.language).format("LL");
  const time = dayjs(now).locale(i18n.language).format("LT");

  return {
    now,
    date,
    time,
  };
};
