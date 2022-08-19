import { useQuery } from "@apollo/client";
import { Spinner } from "components";
import dayjs from "dayjs";
import de from "dayjs/locale/de";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";

import { useTranslation } from "react-i18next";
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

    const numAssignments = data?.messagesByPk.journal.incident.divisions.length || 0;
    const maxCols = Math.max(5, numAssignments);
    const numCols = maxCols % 2 ? maxCols + 1 : maxCols;
    return (
        <>
            <h3 className="title is-size-6 is-capitalized">{t('messageSheet')}</h3>
            {loading ? <Spinner /> : <></>}
            {error ? <div className="notification is-danger">{error?.message}</div> : <></>}
            {data?.messagesByPk ?
                <>
                    <table className="table is-bordered is-fullwidth">
                        <tbody>
                            <tr>
                                <th rowSpan={6}>{t('message.name')}</th>
                                <th>{t('message.sender')}</th>
                                <td colSpan={numCols - 1}>{data?.messagesByPk.sender}</td>
                            </tr>
                            <tr>
                                <th>{t('message.receiver')}</th>
                                <td colSpan={numCols - 1}>{data?.messagesByPk.receiver}</td>
                            </tr>
                            <tr>
                                <th>{t('message.time')}</th>
                                <td colSpan={(numCols - 1) / 2}>{dayjs(data?.messagesByPk.createdAt).format("LLL")}</td>
                                <th>{t('message.createdAt')}</th>
                                <td colSpan={(numCols - 1) / 2}>{dayjs(data?.messagesByPk.createdAt).format("LLL")}</td>
                            </tr>
                            <tr>
                                <th>{t('message.id')}</th>
                                <td colSpan={numCols - 1}>{data?.messagesByPk.id}</td>
                            </tr>
                            <tr>
                                <th>{t('message.type')}</th>
                                <td colSpan={(numCols - 1) / 2}>
                                    {t([`medium.${data?.messagesByPk.mediumId}`, `medium.${Medium.Radio}`])}
                                </td>
                                {data?.messagesByPk.mediumId === Medium.Radio ?
                                    <>
                                        <th>{t('radioChannel')}</th>
                                        <td colSpan={(numCols - 1) / 2}>
                                            {data?.messagesByPk.senderDetail}
                                        </td>
                                    </>
                                    :
                                    <>
                                        <td colSpan={2}></td>
                                    </>
                                }
                            </tr>
                            <tr>
                                <th>{t('message.triage')}</th>
                                <td colSpan={(numCols - 1) / 2}>
                                    {t([`triage.${data?.messagesByPk.triageId}`, `triage.${TriageStatus.Pending}`])}
                                </td>
                                <th>{t('message.priority')}</th>
                                <td colSpan={(numCols - 1) / 2}>
                                    {t([`priority.${data?.messagesByPk.priorityId}`, `priority.${PriorityStatus.Normal}`])}
                                </td>
                            </tr>
                            <tr style={{ height: "40px" }}>
                                <td colSpan={numCols} style={{ border: "none" }} />
                            </tr>

                            <tr style={{ height: "400px" }}>
                                <th>{t('message.content')}</th>
                                <td colSpan={numCols} >{data?.messagesByPk.sender}</td>
                            </tr>
                            <tr style={{ height: "40px" }}>
                                <td colSpan={numCols} style={{ border: "none" }} />
                            </tr>
                            <tr>
                                <th rowSpan={2}>{t('messageFlow')}</th>
                                {data?.messagesByPk.journal.incident.divisions.map((d) => {
                                    return (
                                        <td>{d.name}</td>)
                                })}
                            </tr>
                            <tr>
                                {data?.messagesByPk.journal.incident.divisions.map((d) => {

                                    let assignments = data?.messagesByPk.divisions.map((e) => e.division.name)
                                    let isPresent = assignments.some((e) => e === d.name);

                                    return (
                                        <td>{isPresent ? "x" : ""}</td>)
                                })}
                            </tr>
                        </tbody>
                    </table>
                </>
                : <></>}
        </>
    );



}

export default MessageSheet;