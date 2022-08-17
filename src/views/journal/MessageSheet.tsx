import { useTranslation } from "react-i18next";
import { Message } from "types";

function MessageSheet(props: { message: Message }) {
    const { t } = useTranslation();

    return <h3 className="title is-size-3 is-capitalized">{t('messageSheet')}</h3>;

}

export default MessageSheet;