import { useTranslation } from "react-i18next";
import { PageTitle } from "components/ui";

function List() {
  const { t } = useTranslation();

  return <PageTitle>{t("resources")}</PageTitle>;
}

export default List;
