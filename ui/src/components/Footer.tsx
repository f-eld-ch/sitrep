import { faHeart } from "@fortawesome/free-solid-svg-icons";
import { faGithub } from "@fortawesome/free-brands-svg-icons";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function Footer() {
  return (
    <footer className="footer is-hidden-print">
      <div className="content has-text-centered is-flex is-align-content-space-around is-align-items-center is-justify-content-center">
        <a
          className="has-text-grey-light"
          href="https://github.com/f-eld-ch/sitrep"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="icon-text is-small has-text-black">
            <span className="icon is-align-content-center">
              <FontAwesomeIcon icon={faGithub} />
            </span>
            <span>
              <p className="is-size-7 is-family-monospace">Sitrep</p>
            </span>
          </span>
        </a>

        <p className="is-size-7 is-family-monospace ml-1">
          made with <FontAwesomeIcon icon={faHeart} color="red" /> in Switzerland by{" "}
          <strong>
            <a className="has-text-dark" href="https://github.com/f-eld-ch" target="_blank" rel="noopener noreferrer">
              F-ELD
            </a>
          </strong>
        </p>
      </div>
    </footer>
  );
}

export default Footer;
