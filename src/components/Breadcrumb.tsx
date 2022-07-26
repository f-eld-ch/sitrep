import React from "react";

function Breadcrumb() {
  return (
    <nav className="breadcrumb has-arrow-separator" aria-label="breadcrumbs">
      <ul>
        <li>
          <a href="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/dashboard">GBT Einsatzübung 2021</a>
        </li>
        <li className="is-active">
          <a
            href="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/journal/20728c11-a3ab-4c07-b8d5-c615ac628f53"
            aria-current="page"
          >
            Journal
          </a>
        </li>
      </ul>
    </nav>
  );
}

export default Breadcrumb;
