import { useTranslation } from "react-i18next";
import { PageTitle } from "components/ui";

function New() {
  const { t } = useTranslation();

  return <PageTitle level={3}>{t("createNewTask")}</PageTitle>;
}

function NewForm() {
  return null;
}

export default New;

export { New, NewForm };
