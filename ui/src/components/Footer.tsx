import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faHeart } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import VSHN from "../assets/vshn.svg";

function Footer() {
  return (
    <footer className="px-6 py-2 print:hidden">
      <div className="flex flex-row flex-nowrap items-center justify-center gap-1 font-mono text-xs">
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

        <div className="ml-1 hidden items-center gap-1 md:inline-flex">
          made with
          <FontAwesomeIcon icon={faHeart} color="red" />
          in Switzerland by
          <strong>
            <a
              className="ml-1 text-current"
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
    <div className="ml-1 hidden items-center self-end md:inline-flex">
      and hosted by
      <a
        className="ml-1 self-center text-current"
        href="https://www.vshn.ch"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={VSHN} alt="VSHN" className="h-3 self-center" />
      </a>
    </div>
  );
}

export default Footer;
