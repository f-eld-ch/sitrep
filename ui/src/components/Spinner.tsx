import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function Spinner() {
  return (
    <div className="container is-flex is-justify-content-center is-align-items-center has-text-centered">
      <FontAwesomeIcon icon={faSpinner} spin size="4x" />
    </div>
  );
}

export default Spinner;
