import dayjs from "dayjs";
import { Message } from "types";
import remarkable from "utils/remarkable";

function MessageTable(props: { messages: undefined | Message[] }) {
  return (
    <div className="is-clearfix">
      <h3 className="title is-5">Journal</h3>
      <h5 className="subtitle is-7">Stand: {dayjs(Date.now()).format("LLL")}</h5>
      <table className="table is-fullwidth is-bordered">
        <thead className="is-size-7">
          <tr>
            <th>Zeit</th>
            <th>Sender</th>
            <th>Empfänger</th>
            <th>Nachricht</th>
          </tr>
        </thead>
        <tbody className="is-size-7">
          {props.messages &&
            props.messages.map((message) => (
              <tr>
                <td>{dayjs(message.time).format("LLL")}</td>
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
