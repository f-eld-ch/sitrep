import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import logo from "assets/logo.svg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignIn } from "@fortawesome/free-solid-svg-icons";

export const Login = () => {
  const [searchParams] = useSearchParams();
  const { i18n } = useTranslation();

  const lang = searchParams.get("lang");
  useEffect(() => {
    i18n.changeLanguage(lang || undefined);
  }, [lang, searchParams, i18n]);

  return (
    <section className="hero is-fullheight">
      <div className="hero-body">
        <div className="container has-text-centered">
          <div className="column is-4 is-offset-4">
            <div className="box is-justify-content-center has-background-light">
              <h3 className="title has-text-black">Sitrep</h3>
              <figure className="image is-inline-block is-128x128">
                <img className="is-rounded" src={logo} alt="Logo" />
              </figure>
              <hr />
              <button
                className="button is-block is-primary is-large is-fullwidth"
                onClick={() => {
                  // forward to oauth2 login
                  window.location.replace("/oauth2/sign_in");
                }}
              >
                <span className="icon is-large">
                  <FontAwesomeIcon icon={faSignIn} />
                </span>
                <span>Login</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
