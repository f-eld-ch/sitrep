import { t } from "i18next";
import { ContentInput, ReceiverInput, SaveButton, SenderInput, TimeInput } from "./Elements";

export function Radio() {
  return (
    <div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t("message.receiver")}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <ReceiverInput />
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t("message.sender")}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <SenderInput />
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
