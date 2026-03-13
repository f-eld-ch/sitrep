import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faHeart } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import VSHN from "../assets/vshn.svg";

function Footer() {
  return (
    <footer className="footer is-hidden-print">
      <div className="content has-text-centered is-flex-desktop is-flex-wrap-nowrap is-align-content-space-around is-flex-direction-row	is-align-items-center is-justify-content-center">
        <a
          className="has-text-current"
          href="https://github.com/f-eld-ch/sitrep"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="icon-text is-small is-size-7">
            <span className="icon is-align-content-center">
              <FontAwesomeIcon icon={faGithub} />
            </span>
            <span>
              <strong>
                <p className="is-size-7 is-family-monospace has-text-current">SitRep</p>
              </strong>
            </span>
          </span>
        </a>

        <div className="is-size-7 is-hidden-touch is-family-monospace ml-1 is-flex-desktop is-justis-align-content-center is-align-items-center">
          made with
          <span className="icon-text is-small is-size-7">
            <span className="icon is-align-content-center">
              <FontAwesomeIcon icon={faHeart} color="red" />
            </span>
          </span>
          in Switzerland by
          <strong className="has-text-current">
            <a
              className="has-text-current ml-1"
              href="https://www.f-eld.ch"
              target="_blank"
              rel="noopener noreferrer"
            >
              F-ELD
            </a>
          </strong>
        </div>
        <FooterManaged />
      </div>
    </footer>
  );
}

function FooterManaged() {
  const isSitrepManaged = useBooleanFlagValue("is-sitrep-managed", false);

  if (!isSitrepManaged) {
    return;
  }
  return (
    <div className="is-flex is-size-7 is-family-monospace is-hidden-touch	ml-1 is-justify-content-center is-align-content-center is-align-items-center">
      and hosted by
      <a
        className="has-text-current is-align-self-center ml-1 is-align-content-center is-align-items-center is-justify-content-center"
        href="https://www.vshn.ch"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src={VSHN}
          alt="VSHN"
          className="is-align-self-center"
          style={{ minHeight: "0.7rem" }}
        />
      </a>
    </div>
  );
}

export default Footer;
