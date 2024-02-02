import {
  faBars,
  faCaretDown,
  faClipboard,
  faClipboardCheck,
  faClipboardList,
  faClipboardQuestion,
  faCodeBranch,
  faCog,
  faExplosion,
  faFeed,
  faMapLocationDot,
  faPen,
  faRightFromBracket,
  faTruckMedical,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { FunctionComponent, useContext, useState } from "react";

import { faCalendar, faClock } from "@fortawesome/free-regular-svg-icons";
import logo from "assets/logo.svg";
import { useTranslation } from "react-i18next";
import { NavLink, useParams } from "react-router-dom";
import { UserContext } from "utils";
import { useDate } from "utils/useDate";

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
        <NavLink to="/" className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}>
          <figure className="image is-32x32">
            <img src={logo} alt="Logo" />
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
            <NavLink
              className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
              to="/incident/list"
            >
              <span className="icon-text">
                <span className="icon">
                  <FontAwesomeIcon icon={faExplosion} />
                </span>
                <span>{t("incident")}</span>
              </span>
            </NavLink>
            <div className="navbar-dropdown is-boxed">
              <NavLink
                className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
                to="/incident/list"
              >
                {t("overview")}
              </NavLink>
              <NavLink
                className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
                to="/incident/new"
              >
                {t("createIncident")}
              </NavLink>
              {incidentId ? (
                <NavLink
                  className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
                  to={`/incident/${incidentId}/edit`}
                >
                  {t("editIncident")}
                </NavLink>
              ) : (
                <></>
              )}
            </div>
          </div>
          <JournalNavBar />
          {/* <ResourcesNavBar />
          <TasksNavBar /> */}
          <MapNavBar />
        </div>
        <div className="navbar-end">
          <CurrentTime />
          <hr className="navbar-divider" />
          <UserNavBar />
        </div>
      </div>
    </nav>
  );
};

function CurrentTime() {
  const { time, date } = useDate();

  return (
    <>
      <div className="navbar-item is-right is-hidden-touch">
        <span className="icon-text">
          <span className="icon">
            <FontAwesomeIcon icon={faCalendar} />
          </span>
          <span>{date}</span>
        </span>
      </div>
      <div className="navbar-item is-right  is-hidden-touch">
        <span className="icon-text">
          <span className="icon">
            <FontAwesomeIcon icon={faClock} />
          </span>
          <span>{time}</span>
        </span>
      </div>

    </>
  )
}

function VersionNavBar() {
  return (
    <div className="navbar-item is-left">
      <span className="icon-text is-flex-wrap-nowrap">
        <span className="icon">
          <FontAwesomeIcon icon={faCodeBranch} />
        </span>
        <span><a href={`https://github.com/RedGecko/sitrep/commit/${process.env.REACT_APP_SHA_VERSION}`} target="_blank" rel="noopener noreferrer">{process.env.REACT_APP_VERSION}</a></span>
      </span>
    </div >
  );
}

function UserNavBar() {
  const userState = useContext(UserContext);
  const { t } = useTranslation();

  if (!userState.isLoggedin) return <></>;

  return (
    <div className="navbar-item has-dropdown is-hoverable is-left ml-3">
      <div className="navbar-link">
        <FontAwesomeIcon icon={faCog} />
      </div>
      <div className="navbar-dropdown is-boxed is-right">
        <VersionNavBar />
        <div className="navbar-item">
          <span className="icon-text is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faUser} />
            </span>
            <span>{userState.email || userState.username}</span>
          </span>
        </div>
        <hr className="navbar-divider" />
        <a className="navbar-item" href="/oauth2/sign_out">
          <span className="icon-text is-flex-wrap-nowrap is-capitalized">
            <span className="icon">
              <FontAwesomeIcon icon={faRightFromBracket} />
            </span>
            <span>{t("logout")}</span>
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
            <span>{t("journal")}</span>
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
          <span>{t("journal")}</span>
        </span>
      </NavLink>
      <div className="navbar-dropdown is-boxed">
        <NavLink
          className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}`}
        >
          <span className="icon-text is-capitalized is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faFeed} />
            </span>
            <span>{t("journal")}-Feed</span>
          </span>
        </NavLink>
        <NavLink
          className={({ isActive }) => "navbar-item is-capitalized" + (isActive ? " is-active" : "")}
          end={true}
          to={`/incident/${incidentId}/journal/${journalId}/edit`}
        >
          <span className="icon-text is-capitalized is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faPen} />
            </span>
            <span>{t("editor")}</span>
          </span>
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
        <span className="icon-text is-capitalized is-flex-wrap-nowrap">
          <span className="icon">
            <FontAwesomeIcon icon={faClipboard} />
          </span>
          <span>{t("tasksRequestOrders")}</span>
        </span>
      </NavLink>
      <div className="navbar-dropdown is-boxed">
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          to={`/incident/${incidentId}/tasks`}
        >
          <span className="icon-text is-capitalized is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faClipboardCheck} />
            </span>
            <span>{t("tasksOrders")}</span>
          </span>
        </NavLink>
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          to={`/incident/${incidentId}/requests`}
        >
          <span className="icon-text is-capitalized is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faClipboardQuestion} />
            </span>
            <span>{t("requestsNeeds")}</span>
          </span>
        </NavLink>
        <NavLink
          className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
          to={`/incident/${incidentId}/soma`}
        >
          <span className="icon-text is-capitalized is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faClipboardList} />
            </span>
            <span>{t("immediateMeasures")}</span>
          </span>
        </NavLink>
      </div>
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
          <span>{t("resources")}</span>
        </span>
      </NavLink>
    </div>
  );
};

const MapNavBar: FunctionComponent = () => {
  let { incidentId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return <></>;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}
        to={`/incident/${incidentId}/map`}
      >
        <span className="icon-text is-capitalized">
          <span className="icon">
            <FontAwesomeIcon icon={faMapLocationDot} />
          </span>
          <span>{t("map")}</span>
          <span className="has-text-warning	ml-1">(beta)</span>
        </span>
      </NavLink>
    </div>
  );
};

export {
  ResourcesNavBar, TasksNavBar
};

export default Navbar;
