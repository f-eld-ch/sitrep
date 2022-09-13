import { useQuery } from "@apollo/client";
import { faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "components";
import dayjs from "dayjs";
import de from "dayjs/locale/de";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";

import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import { Medium, PriorityStatus, TriageMessageData, TriageMessageVars, TriageStatus } from "types";
import { GetMessageForTriage } from "./graphql";

dayjs.locale(de);
dayjs.extend(LocalizedFormat);
dayjs.extend(relativeTime);

function MessageSheet() {
    const { messageId } = useParams();
    const { t } = useTranslation();

    const { loading, error, data } = useQuery<TriageMessageData, TriageMessageVars>(
        GetMessageForTriage,
        {
            variables: { messageId: messageId },
            fetchPolicy: "cache-and-network",
        }
    );

    return (
        <>
            <h3 className="title is-size-6 is-capitalized">{t('messageSheet')}</h3>
            {loading ? <Spinner /> : <></>}
            {error ? <div className="notification is-danger">{error?.message}</div> : <></>}
            {data?.messagesByPk &&
                <>
                    <table className="table is-bordered is-fullwidth">
                        <tbody >
                            <tr>
                                <th rowSpan={6} style={{ width: "150px" }}>{t('message.name')}</th>
                                <th>{t('message.sender')}</th>
                                {data?.messagesByPk.mediumId === Medium.Radio || !data.messagesByPk.senderDetail?.length ?
                                    <td colSpan={3}>{data?.messagesByPk.sender}</td>
                                    :
                                    <td colSpan={3}>{data?.messagesByPk.sender} ({data?.messagesByPk.senderDetail})</td>
                                }
                            </tr>
                            <tr>
                                <th>{t('message.receiver')}</th>
                                {data?.messagesByPk.mediumId === Medium.Radio || !data.messagesByPk.receiverDetail?.length ?
                                    <td colSpan={3}>{data?.messagesByPk.receiver}</td>
                                    :
                                    <td colSpan={3}>{data?.messagesByPk.receiver} ({data?.messagesByPk.receiverDetail})</td>
                                }                            </tr>
                            <tr>
                                <th>{t('message.time')}</th>
                                <td>{dayjs(data?.messagesByPk.createdAt).format("LLL")}</td>
                                <th>{t('message.createdAt')}</th>
                                <td>{dayjs(data?.messagesByPk.createdAt).format("LLL")}</td>
                            </tr>
                            <tr>
                                <th>{t('message.id')}</th>
                                <td colSpan={3}>{data?.messagesByPk.id}</td>
                            </tr>
                            <tr>
                                <th>{t('message.type')}</th>

                                {data?.messagesByPk.mediumId === Medium.Radio ?
                                    <>
                                        <td>{t([`medium.${data?.messagesByPk.mediumId}`, `medium.${Medium.Radio}`])}</td>
                                        <th>{t('radioChannel')}</th>
                                        <td>
                                            {data?.messagesByPk.senderDetail}
                                        </td>
                                    </>
                                    :
                                    <td colSpan={3}>{t([`medium.${data?.messagesByPk.mediumId}`, `medium.${Medium.Radio}`])}</td>
                                }
                            </tr>
                            <tr>
                                <th>{t('message.triage')}</th>
                                <td>
                                    {t([`triage.${data?.messagesByPk.triageId}`, `triage.${TriageStatus.Pending}`])}
                                </td>
                                <th>{t('message.priority')}</th>
                                <td>
                                    {t([`priority.${data?.messagesByPk.priorityId}`, `priority.${PriorityStatus.Normal}`])}
                                </td>
                            </tr>

                            <tr style={{ height: "400px" }}>
                                <th>{t('message.content')}</th>
                                <td colSpan={4}><div className="content"><ReactMarkdown>{data?.messagesByPk.content}</ReactMarkdown></div></td>
                            </tr>
                        </tbody>
                    </table>
                    <table className="table is-bordered is-fullwidth mt-2" style={{ "tableLayout": "fixed" }}>
                        <tbody>

                            <tr>
                                <th rowSpan={2} style={{ width: "150px" }}>{t('messageFlow')}</th>
                                {data?.messagesByPk.journal.incident.divisions.map((d) => {
                                    return (
                                        <td className="has-text-centered">{d.name}</td>)
                                })}
                            </tr>
                            <tr>
                                {data?.messagesByPk.journal.incident.divisions.map((d) => {

                                    let assignments = data?.messagesByPk.divisions.map((e) => e.division.name)
                                    let isPresent = assignments.some((e) => e === d.name);

                                    return (
                                        <td className="has-text-centered">{isPresent ? <FontAwesomeIcon icon={faSquareCheck} /> : <FontAwesomeIcon icon={faSquare} />}</td>)
                                })}
                            </tr>
                        </tbody>
                    </table>
                </>
            }
        </>
    );



}

export default MessageSheet;