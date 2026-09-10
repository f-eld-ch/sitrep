import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function Spinner() {
  return (
    <div className="flex justify-center items-center text-center">
      <FontAwesomeIcon icon={faSpinner} spin size="4x" />
    </div>
  );
}

export default Spinner;
