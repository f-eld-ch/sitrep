import dayjs from "dayjs";
import { useEffect, useState } from "react";

export const useDate = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1 * 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const date = dayjs(now).format("LL");
  const time = dayjs(now).format("LT");

  return {
    now,
    date,
    time,
  };
};
