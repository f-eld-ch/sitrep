import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { FeatureMessage } from "types/layer";

/** The popup's content: the messages a feature was drawn for, in the order they took effect. */
export function FeatureMessagesList({ messages }: { messages: FeatureMessage[] }) {
  const { t } = useTranslation();

  return (
    <ul className="max-h-60 space-y-2 overflow-y-auto">
      {messages.map((m) => (
        <li key={m.id} className="text-xs">
          <p className="font-semibold text-gray-900">
            {t("featureMessages.message", { number: m.number })}
            <span className="ml-2 font-normal text-gray-500">
              {dayjs(m.time).format("DD.MM.YY HH:mm")}
            </span>
          </p>
          <p className="text-gray-600">
            {m.sender}
            {m.receiver ? ` → ${m.receiver}` : ""}
          </p>
          <p className="line-clamp-3 text-gray-800">{m.content}</p>
        </li>
      ))}
    </ul>
  );
}
