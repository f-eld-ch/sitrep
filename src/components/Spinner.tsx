import React from "react";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

function Spinner() {
  return (
    <div className="has-text-centered">
      <FontAwesomeIcon icon={faSpinner as IconProp} spin size="4x" />
    </div>
  );
}

export default Spinner;
