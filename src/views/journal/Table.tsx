import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { Message } from "types";
import remarkable from "utils/remarkable";

function MessageTable(props: { messages: undefined | Message[] }) {
  const { t } = useTranslation();

  return (
    <div className="is-clearfix">
      <h5 className="subtitle is-7">{t('state')}: {dayjs(Date.now()).format("LLL")}</h5>
      <table className="table is-fullwidth is-narrow">
        <thead>
          <tr>
            <th className="is-capitalized" style={{ minWidth: "120px" }}>{t('message.time')}</th>
            <th className="is-capitalized">{t('message.sender')}</th>
            <th className="is-capitalized">{t('message.receiver')}</th>
            <th className="is-capitalized">{t('message.content')}</th>
          </tr>
        </thead>
        <tbody>
          {props.messages &&
            props.messages.map((message) => (
              <tr key={message.id}>
                <td>{dayjs(message.time).format("DD.MM.YYYY HH:mm:ss")}</td>
                <td>{message.sender}</td>
                <td>{message.receiver}</td>
                <td>
                  <div
                    className="content is-normal has-text-left"
                    dangerouslySetInnerHTML={{ __html: remarkable.render(message.content) }}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default MessageTable;
