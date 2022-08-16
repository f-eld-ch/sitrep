import React from "react";
import { useTranslation } from "react-i18next";

function List() {
  const { t } = useTranslation();

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t('resources')}</h3>
    </>
  );
}

export default List;
