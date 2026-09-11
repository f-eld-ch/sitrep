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
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Brand panel — deliberately ignores light/dark toggle, always dark */}
      <div className="flex w-full items-center justify-center bg-dark-elevated text-paper md:w-1/2">
        <div className="flex flex-col items-start">
          <img src={logo} alt="sitrep" className="h-24 w-auto" />
          <p className="mt-4 ml-3 text-xl">{t("loginTagline")}</p>
        </div>
      </div>
      <div className="mt-8 flex w-full items-center justify-center md:mt-0 md:w-1/2">
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
