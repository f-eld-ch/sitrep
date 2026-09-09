import { faSignIn } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import logo from "assets/lockup-white.svg";
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
    <div className="columns is-gapless login-split m-0">
      <div className="column is-half login-brand is-flex is-justify-content-center is-align-items-center">
        <div className="is-flex is-flex-direction-column is-align-items-flex-start">
          <img src={logo} alt="sitrep" style={{ height: "6rem", width: "auto" }} />
          <p className="mt-4 is-size-5 ml-3">{t("loginTagline")}</p>
        </div>
      </div>
      <div className="column is-half login-actions is-flex is-justify-content-center is-align-items-center mt-6">
        <button
          type="button"
          className="button is-primary is-large is-capitalized"
          onClick={() => {
            // forward to oauth2 login
            window.location.replace("/oauth2/sign_in");
          }}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faSignIn} />
          </span>
          <span>{t("login")}</span>
        </button>
      </div>
    </div>
  );
};
