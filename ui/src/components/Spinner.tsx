import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function Spinner() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <FontAwesomeIcon icon={faSpinner} spin size="4x" />
    </div>
  );
}

export default Spinner;
