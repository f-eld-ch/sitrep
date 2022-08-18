import { useQuery } from "@apollo/client";
import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { TriageMessageData, TriageMessageVars } from "types";
import { GetMessageForTriage } from "./graphql";

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
            <h3 className="title is-size-3 is-capitalized">{t('messageSheet')}</h3>
            {loading ? <Spinner /> : <></>}
            {error ? <div className="notification is-danger">{error?.message}</div> : <></>}
            {data?.messages_by_pk ?
                <>
                    <div className="columns">
                        <div className="column">
                            {data?.messages_by_pk.sender}
                        </div>
                        <div className="column">
                            {data?.messages_by_pk.receiver}
                        </div>
                        <div className="column">
                            {data?.messages_by_pk.time}

                        </div>
                        <div className="column">
                            {data?.messages_by_pk.id}
                        </div>
                    </div>
                </>
                : <></>}
        </>
    );



}

export default MessageSheet;