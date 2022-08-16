import { FunctionComponent, useContext, useState } from "react";
import {
  faBars,
  faCaretDown,
  faCodeBranch,
  faExplosion,
  faListCheck,
  faRightFromBracket,
  faTruckMedical,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";

import logo from "assets/logo.svg";
import { NavLink, useParams } from "react-router-dom";
import { UserContext } from "utils";
import { useTranslation } from "react-i18next";

const Navbar: FunctionComponent<{ isActive?: boolean }> = ({ isActive = false }) => {
  const [isMenuActive, setIsMenuActive] = useState<boolean>(isActive);
  const { t } = useTranslation();

  let { incidentId } = useParams();
  const navbarMenuClass = classNames({
    "navbar-menu": true,
    "is-active": isMenuActive,
  });


  return (
    <nav className="navbar is-fixed-top is-hidden-print">
      <div className="navbar-brand">
        <NavLink to="/" className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}>
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
            <NavLink className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")} to="/incident/list">
              <span className="icon-text">
                <span className="icon">
                  <FontAwesomeIcon icon={faExplosion} />
                </span>
                <span>{t('incident')}</span>
              </span>
            </NavLink>
            <div className="navbar-dropdown is-boxed">
              <NavLink className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")} to="/incident/list">
                {t('overview')}
              </NavLink>
              <NavLink className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")} to="/incident/new">
                {t('createIncident')}
              </NavLink>
              {incidentId ? (
                <NavLink
                  className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}
                  to={`/incident/${incidentId}/edit`}
                >
                  {t('editIncident')}
                </NavLink>
              ) : (
                <></>
              )}
            </div>
          </div>
          <JournalNavBar />
          <TasksNavBar />
          <ResourcesNavBar />
        </div>
        <div className="navbar-end">
          <UserNavBar />
        </div>
      </div>
    </nav>
  );
};

function VersionNavBar() {
  return (
    <div className="navbar-item">
      <span className="icon-text is-flex-wrap-nowrap">
        <span className="icon">
          <FontAwesomeIcon icon={faCodeBranch} />
        </span>
        {process.env.REACT_APP_VERSION === "develop" ? (
          <span>{process.env.REACT_APP_SHA_VERSION}</span>
        ) : (
          <span>{process.env.REACT_APP_VERSION}</span>
        )}
      </span>
    </div>
  );
}

function UserNavBar() {
  const userState = useContext(UserContext);
  const { t } = useTranslation();

  if (!userState.isLoggedin) return <></>;

  return (
    <div className="navbar-item has-dropdown is-hoverable is-left">
      <div className="navbar-link" />
      <div className="navbar-dropdown is-boxed is-right">
        <VersionNavBar />
        <div className="navbar-item">
          <span className="icon-text is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faUser} />
            </span>
            <span>{userState.username || userState.email}</span>
          </span>
        </div>
        <hr className="navbar-divider" />
        <a className="navbar-item" href="/oauth2/sign_out">
          <span className="icon-text is-flex-wrap-nowrap is-capitalized">
            <span className="icon">
              <FontAwesomeIcon icon={faRightFromBracket} />
            </span>
            <span>{t('logout')}</span>
          </span>
        </a>
      </div>
    </div>
  );
}

const JournalNavBar: FunctionComponent = () => {
  let { incidentId, journalId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return <></>;

  if (!journalId)
    return (
      <div className="navbar-item has-dropdown is-hoverable">
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/view`}
        >
          <span className="icon-text is-capitalized">
            <span className="icon">
              <FontAwesomeIcon icon={faBars} />
            </span>
            <span>{t('journal')}</span>
          </span>
        </NavLink>
      </div>
    );

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}
        end={true}
        to={`/incident/${incidentId}/journal/view`}
      >
        <span className="icon-text is-capitalized">
          <span className="icon">
            <FontAwesomeIcon icon={faBars} />
          </span>
          <span>{t('journal')}</span>
        </span>
      </NavLink>
      <div className="navbar-dropdown is-boxed">
        <NavLink
          className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}`}
        >
          {t('journal')}
        </NavLink>
        <NavLink
          className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}/edit`}
        >
          {t('editor')}
        </NavLink>
        <NavLink
          className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}/hotline`}
        >
          {t('hotline')}
        </NavLink>
      </div>
    </div>
  );
};

const TasksNavBar: FunctionComponent = () => {
  let { incidentId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return <></>;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
        to={`/incident/${incidentId}/tasks`}
      >
        <span className="icon-text is-capitalized">
          <span className="icon">
            <FontAwesomeIcon icon={faListCheck} />
          </span>
          <span>{t('tasksRequests')}</span>
        </span>
      </NavLink>
    </div>
  );
};

const ResourcesNavBar: FunctionComponent = () => {
  let { incidentId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return <></>;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
        to={`/incident/${incidentId}/resources`}
      >
        <span className="icon-text is-capitalized">
          <span className="icon">
            <FontAwesomeIcon icon={faTruckMedical} />{" "}
          </span>
          <span>{t('resources')}</span>
        </span>
      </NavLink>
    </div>
  );
};

export default Navbar;
