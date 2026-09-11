import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function Spinner() {
  return (
    <div className="flex w-full justify-center items-center min-h-[50vh]">
      <FontAwesomeIcon icon={faSpinner} spin size="4x" />
    </div>
  );
}

export default Spinner;
