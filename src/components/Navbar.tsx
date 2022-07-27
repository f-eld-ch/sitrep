import { FunctionComponent, useState } from "react";
import {
  faBars,
  faCaretDown,
  faCog,
  faExplosion,
  faListCheck,
  faTruckMedical,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";

import logo from "assets/logo.svg";
import { NavLink, useParams } from "react-router-dom";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

const Navbar: FunctionComponent<{ isActive?: boolean }> = ({ isActive = false }) => {
  const [isMenuActive, setIsMenuActive] = useState<boolean>(isActive);

  const navbarMenuClass = classNames({
    "navbar-menu": true,
    "is-active": isMenuActive,
  });

  return (
    <nav className="navbar is-fixed-top is-hidden-print">
      <div className="navbar-brand">
        <NavLink to="/" className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}>
          <figure className="image is-32x32">
            <img src={logo} alt="Logo" className="is-rounded" />
          </figure>
        </NavLink>
        <button
          className="navbar-burger burger"
          data-target="navbarBasic"
          onClick={(e) => {
            e.preventDefault();
            setIsMenuActive(!isMenuActive);
          }}
        >
          <FontAwesomeIcon icon={faCaretDown}></FontAwesomeIcon>
        </button>
      </div>

      <div className={navbarMenuClass}>
        <div className="navbar-start">
          <div className="navbar-item has-dropdown is-hoverable">
            <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to="/incident/list">
              <span className="icon-text">
                {" "}
                <FontAwesomeIcon icon={faExplosion as IconProp} className="icon" />
                <span>Ereignis</span>
              </span>
            </NavLink>
            <div className="navbar-dropdown">
              <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to="/incident/list">
                Übersicht
              </NavLink>
              <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to="/incident/new">
                Neues Ereignis erstellen
              </NavLink>
            </div>
          </div>
          <JournalNavBar />
          <TasksNavBar />
          <ResourcesNavBar />
        </div>
        <div className="navbar-end">
          <div className="navbar-item has-dropdown is-hoverable is-left">
            <div className="navbar-link">
              <FontAwesomeIcon icon={faCog as IconProp} />
            </div>
            <div className="navbar-dropdown">
              <a className="navbar-item" href="https://bulma.io/documentation/overview/start/">
                Profil
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

const JournalNavBar: FunctionComponent = () => {
  let { incidentId, journalId } = useParams();
  if (!incidentId) return <></>;

  if (!journalId)
    return (
      <div className="navbar-item has-dropdown is-hoverable">
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/view`}
        >
          <span className="icon-text">
            {" "}
            <FontAwesomeIcon icon={faBars as IconProp} className="icon" />
            <span>Journal</span>
          </span>
        </NavLink>
      </div>
    );

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
        end={true}
        to={`/incident/${incidentId}/journal/view`}
      >
        <span className="icon-text">
          {" "}
          <FontAwesomeIcon icon={faBars as IconProp} className="icon" />
          <span>Journal</span>
        </span>
      </NavLink>
      <div className="navbar-dropdown">
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}`}
        >
          Journal
        </NavLink>
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}/edit`}
        >
          Journal bearbeiten
        </NavLink>
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}/hotline`}
        >
          Hotline
        </NavLink>
      </div>
    </div>
  );
};

const TasksNavBar: FunctionComponent = () => {
  let { incidentId } = useParams();
  if (!incidentId) return <></>;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
        to={`/incident/${incidentId}/tasks`}
      >
        <span className="icon-text">
          {" "}
          <FontAwesomeIcon icon={faListCheck as IconProp} className="icon" />
          <span>Pendenzen / Anträge / Bedürfnisse</span>
        </span>
      </NavLink>
    </div>
  );
};

const ResourcesNavBar: FunctionComponent = () => {
  let { incidentId } = useParams();
  if (!incidentId) return <></>;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
        to={`/incident/${incidentId}/resources`}
      >
        <span className="icon-text">
          {" "}
          <FontAwesomeIcon icon={faTruckMedical as IconProp} className="icon" />
          <span>Mittel</span>
        </span>
      </NavLink>
    </div>
  );
};

export default Navbar;
