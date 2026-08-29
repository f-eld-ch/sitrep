import { Medium } from "types";
import { useTranslation } from "react-i18next";
import {
  ContentInput,
  ReceiverDetailInput,
  ReceiverInput,
  SaveButton,
  SenderDetailInput,
  SenderInput,
  TimeInput,
} from "./Elements";
import { FormRow } from "./FormRow";

type Party = "sender" | "receiver";
type NonRadioMedium = Exclude<Medium, Medium.Radio>;

interface MediumFormConfig {
  readonly order: readonly [Party, Party];
  readonly detailPlaceholderKey?: "phoneNumber" | "emailAddress" | "otherDetails";
}

// Medium enum values are uppercase ("PHONE"), locale namespaces are lowercase ("phone").
// t([`${medium.toLowerCase()}.${party}`, `message.${party}`]) resolves to the
// medium-specific label when it exists, and falls back to the generic label otherwise.
const MEDIUM_FORM_CONFIG: Record<Medium, MediumFormConfig> = {
  [Medium.Radio]: { order: ["receiver", "sender"] },
  [Medium.Phone]: { order: ["receiver", "sender"], detailPlaceholderKey: "phoneNumber" },
  [Medium.Email]: { order: ["sender", "receiver"], detailPlaceholderKey: "emailAddress" },
  [Medium.Other]: { order: ["sender", "receiver"], detailPlaceholderKey: "otherDetails" },
};

const PARTY_INPUTS = {
  sender: { Input: SenderInput, Detail: SenderDetailInput },
  receiver: { Input: ReceiverInput, Detail: ReceiverDetailInput },
} as const;

export function MediumForm({ medium }: { medium: Medium }) {
  const { t } = useTranslation();
  const { order, detailPlaceholderKey } = MEDIUM_FORM_CONFIG[medium];
  const hasDetail = detailPlaceholderKey !== undefined;
  const detailPlaceholder = hasDetail ? (t(detailPlaceholderKey) as string) : undefined;
  const nonRadioMedium = medium as NonRadioMedium;

  return (
    <div>
      {order.map((party) => {
        const { Input, Detail } = PARTY_INPUTS[party];
        const label = t([`${medium.toLowerCase()}.${party}`, `message.${party}`]) as string;
        return (
          <FormRow key={party} grouped={hasDetail} label={label}>
            {(id) => (
              <>
                <Input id={id} />
                {hasDetail && detailPlaceholder && (
                  <Detail placeholder={detailPlaceholder} medium={nonRadioMedium} />
                )}
              </>
            )}
          </FormRow>
        );
      })}
      <FormRow label={t("message.time") as string}>{(id) => <TimeInput id={id} />}</FormRow>
      <FormRow label={t("message.content") as string}>{(id) => <ContentInput id={id} />}</FormRow>
      <FormRow>{() => <SaveButton />}</FormRow>
    </div>
  );
}
