import { faSignIn } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import logo from "assets/lockup-white.svg";
import { Button } from "components/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

export const Login = () => {
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const lang = searchParams.get("lang");
  useEffect(() => {
    i18n.changeLanguage(lang || undefined);
  }, [lang, i18n]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Brand panel — deliberately ignores light/dark toggle, always dark */}
      <div className="w-full md:w-1/2 flex justify-center items-center bg-dark-elevated text-paper">
        <div className="flex flex-col items-start">
          <img src={logo} alt="sitrep" style={{ height: "6rem", width: "auto" }} />
          <p className="mt-4 text-xl ml-3">{t("loginTagline")}</p>
        </div>
      </div>
      <div className="w-full md:w-1/2 flex justify-center items-center mt-8 md:mt-0">
        <Button
          type="button"
          variant="primary"
          size="lg"
          capitalized
          onClick={() => {
            window.location.replace("/oauth2/sign_in");
          }}
        >
          <FontAwesomeIcon icon={faSignIn} className="mr-2" />
          {t("login")}
        </Button>
      </div>
    </div>
  );
};
