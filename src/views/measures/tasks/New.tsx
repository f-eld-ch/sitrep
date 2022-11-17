import React from "react";
import { useTranslation } from "react-i18next";

function New() {
  const { t } = useTranslation();

  return <h3 className="title is-size-5 is-capitalized">{t('createNewTask')}</h3>;
}

function NewForm() {
  return <></>;
}

export default New;

export { NewForm, New };
