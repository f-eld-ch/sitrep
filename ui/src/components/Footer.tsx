import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faHeart } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import VSHN from "../assets/vshn.svg";

function Footer() {
  return (
    <footer className="print:hidden px-6 py-2">
      <div className="flex flex-nowrap flex-row items-center justify-center gap-1 text-xs font-mono">
        <a
          className="text-current"
          aria-label="SitRep on GitHub"
          href="https://github.com/f-eld-ch/sitrep"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="inline-flex items-center gap-1">
            <FontAwesomeIcon icon={faGithub} />
            <strong>SitRep</strong>
          </span>
        </a>

        <div className="hidden md:inline-flex items-center gap-1 ml-1">
          made with
          <FontAwesomeIcon icon={faHeart} color="red" />
          in Switzerland by
          <strong>
            <a
              className="text-current ml-1"
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
    <div className="hidden md:inline-flex items-center ml-1 self-end">
      and hosted by
      <a
        className="text-current self-center ml-1"
        href="https://www.vshn.ch"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={VSHN} alt="VSHN" className="self-center h-3" />
      </a>
    </div>
  );
}

export default Footer;
