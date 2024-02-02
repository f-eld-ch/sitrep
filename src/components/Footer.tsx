import { faHeart } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function Footer() {
  return (
    <footer className="footer has-background-white-bis is-hidden-print">
      <div className="content has-text-centered">
        <p className="is-size-7 is-family-monospace">
          Made with <FontAwesomeIcon icon={faHeart} color="red" /> in Switzerland by <strong>F-ELD</strong>
        </p>
      </div>
    </footer>
  );
}

export default Footer;
