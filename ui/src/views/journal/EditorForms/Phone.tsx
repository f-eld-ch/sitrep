import { t } from "i18next";
import {
  ContentInput,
  ReceiverDetailInput,
  ReceiverInput,
  SaveButton,
  SenderDetailInput,
  SenderInput,
  TimeInput,
} from "./Elements";

export function Phone() {
  return (
    <div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t("message.receiver")}</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline">
            <ReceiverInput />
            <ReceiverDetailInput placeholder={t("phoneNumber")} />
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t("phone.sender")}</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline">
            <SenderInput />
            <SenderDetailInput placeholder={t("phoneNumber")} />
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t("message.time")}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <TimeInput />
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t("message.content")}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <ContentInput />
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label"></div>
        <div className="field-body">
          <div className="field">
            <SaveButton />
          </div>
        </div>
      </div>
    </div>
  );
}
