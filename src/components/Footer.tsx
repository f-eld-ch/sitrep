import React from 'react';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

function Footer() {
  
  return (
    <footer className="footer has-background-white-bis">
        <div className="content has-text-centered">
            <p>Made with <FontAwesomeIcon icon={faHeart} color="red" /> in Switzerland by <strong>ZSO Uri</strong></p>
        </div>
    </footer>
  );
}

export default Footer;









