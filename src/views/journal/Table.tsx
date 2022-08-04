import dayjs from "dayjs";
import { Message } from "types";
import remarkable from "utils/remarkable";

function MessageTable(props: { messages: undefined | Message[] }) {
  return (
    <div className="is-clearfix">
      <h5 className="subtitle is-7">Stand: {dayjs(Date.now()).format("LLL")}</h5>
      <table className="table is-fullwidth is-narrow">
        <thead>
          <tr>
            <th style={{ minWidth: "120px" }}>Zeit</th>
            <th>Sender</th>
            <th>Empfänger</th>
            <th>Nachricht</th>
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
