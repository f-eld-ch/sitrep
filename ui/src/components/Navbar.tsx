import { faCalendar, faClock } from "@fortawesome/free-regular-svg-icons";
import {
  faBars,
  faCaretDown,
  faCirclePlus,
  faClipboard,
  faClipboardCheck,
  faClipboardList,
  faClipboardQuestion,
  faCodeBranch,
  faCog,
  faExplosion,
  faFeed,
  faMapLocationDot,
  faMoon,
  faPen,
  faRectangleList,
  faRightFromBracket,
  faSun,
  faTruckMedical,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import logo from "assets/logo.svg";
import classNames from "classnames";
import { type FunctionComponent, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useParams } from "react-router";
import { IncidentContext, UserContext } from "utils";
import { useDarkMode } from "utils/useDarkMode";
import { useDate } from "utils/useDate";
import { CURRENT_SHA, CURRENT_VERSION, changelogUrl } from "utils/version";
import LanguageSwitcher from "./LanguageSwitcher";

const Navbar: FunctionComponent<{ isActive?: boolean }> = ({ isActive = false }) => {
  const [isMenuActive, setIsMenuActive] = useState<boolean>(isActive);
  const { t } = useTranslation();

  const { state: incidentState } = useContext(IncidentContext);

  const navbarMenuClass = classNames({
    "navbar-menu": true,
    "is-active": isMenuActive,
  });

  const showResources = useBooleanFlagValue("show-resources", false);
  const showTasks = useBooleanFlagValue("show-tasks", false);

  return (
    <nav className="navbar is-fixed-top is-hidden-print">
      <div className="navbar-brand">
        <NavLink
          to="/"
          className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
        >
          <figure className="image is-24x24">
            <img src={logo} alt="Logo" />
          </figure>
        </NavLink>
        <button
          type="button"
          className="navbar-burger burger"
          data-target="navbarBasic"
          aria-label="Toggle menu"
          aria-expanded={isMenuActive}
          aria-controls="navbarBasic"
          onClick={(e) => {
            e.preventDefault();
            setIsMenuActive(!isMenuActive);
          }}
        >
          <FontAwesomeIcon icon={faCaretDown} />
        </button>
      </div>

      <div id="navbarBasic" className={navbarMenuClass} data-testid="navbar-menu">
        <div className="navbar-start">
          <div className="navbar-item has-dropdown is-hoverable">
            <NavLink
              to={incidentState.incident ? `/incident/${incidentState.incident.id}/edit` : "/"}
              className={({ isActive }) =>
                `navbar-item${isActive ? " is-active has-text-dark" : ""}`
              }
            >
              <span className="icon-text">
                <span className="icon">
                  <FontAwesomeIcon icon={faExplosion} />
                </span>
                {incidentState.incident ? (
                  <span>
                    {t("incident")} {incidentState.incident.name}
                  </span>
                ) : (
                  <span>{t("incident")}</span>
                )}
              </span>
            </NavLink>
            <div className="navbar-dropdown">
              <NavLink
                className={({ isActive }) =>
                  `navbar-item${isActive ? " is-active has-text-dark" : ""}`
                }
                to="/incident/list"
              >
                <span className="icon-text is-capitalized is-flex-wrap-nowrap">
                  <span className="icon">
                    <FontAwesomeIcon icon={faRectangleList} />
                  </span>
                  <span>{t("overview")}</span>
                </span>
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `navbar-item${isActive ? " is-active has-text-dark" : ""}`
                }
                to="/incident/new"
              >
                <span className="icon-text is-capitalized is-flex-wrap-nowrap">
                  <span className="icon">
                    <FontAwesomeIcon icon={faCirclePlus} />
                  </span>
                  <span>{t("createIncident")}</span>
                </span>
              </NavLink>
              {incidentState.incident && (
                <NavLink
                  className={({ isActive }) =>
                    `navbar-item${isActive ? " is-active has-text-dark" : ""}`
                  }
                  to={`/incident/${incidentState.incident.id}/edit`}
                >
                  <span className="icon-text is-capitalized is-flex-wrap-nowrap">
                    <span className="icon">
                      <FontAwesomeIcon icon={faPen} />
                    </span>
                    <span>{t("editIncident")}</span>
                  </span>
                </NavLink>
              )}
            </div>
          </div>
          <JournalNavBar />
          {showResources && <ResourcesNavBar />}
          {showTasks && <TasksNavBar />}
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

function DarkModeSwitcher() {
  const { isDarkMode, toggle } = useDarkMode();

  useEffect(
    () => {
      const element = window.document.querySelector(":root");
      if (isDarkMode) {
        element?.classList.add("theme-dark");
        element?.classList.remove("theme-light");
        document.documentElement.setAttribute("data-color-mode", "dark");
      } else {
        element?.classList.remove("theme-dark");
        element?.classList.add("theme-light");
        document.documentElement.setAttribute("data-color-mode", "light");
      }
    },
    [isDarkMode], // Only re-call effect when value changes
  );

  return (
    <div className="navbar-item">
      <button
        type="button"
        aria-label={isDarkMode ? "Switch to light mode (Dark)" : "Switch to dark mode (Light)"}
        onClick={toggle}
      >
        <span className="icon-text is-flex-wrap-nowrap">
          <span className="icon">
            <FontAwesomeIcon icon={isDarkMode ? faMoon : faSun} />
          </span>
          <span>{isDarkMode ? "Dark" : "Light"}</span>
        </span>
      </button>
    </div>
  );
}

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
      <div className="navbar-item is-right is-hidden-touch">
        <span className="icon-text">
          <span className="icon">
            <FontAwesomeIcon icon={faClock} />
          </span>
          <span>{time}</span>
        </span>
      </div>
    </>
  );
}

function VersionNavBar() {
  return (
    <div className="navbar-item is-left">
      <span className="icon-text is-flex-wrap-nowrap">
        <span className="icon">
          <FontAwesomeIcon icon={faCodeBranch} />
        </span>
        <span>
          <a
            /* Deliberately the running build, not the deployed one: this element labels
               the version the user is currently on. */
            href={changelogUrl(CURRENT_SHA)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {CURRENT_VERSION}
          </a>
        </span>
      </span>
    </div>
  );
}

function UserNavBar() {
  const { state: userState } = useContext(UserContext);
  const { t } = useTranslation();

  if (!userState.isLoggedin) return;

  return (
    <div className="navbar-item has-dropdown is-hoverable is-left ml-3">
      <div className="navbar-link">
        <FontAwesomeIcon icon={faCog} />
      </div>
      <div className="navbar-dropdown is-right">
        <VersionNavBar />
        <div className="navbar-item">
          <span className="icon-text is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faUser} />
            </span>
            <span>{userState.email || userState.username}</span>
          </span>
        </div>
        <DarkModeSwitcher />
        <LanguageSwitcher />
        <hr className="navbar-divider" />
        <a className="navbar-item" href="/oauth2/sign_out" aria-label={t("logout")}>
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
  const { t } = useTranslation();
  const { state: incidentState } = useContext(IncidentContext);

  if (!incidentState || !incidentState.incident) return;

  if (!incidentState.journal) {
    return (
      <div className="navbar-item has-dropdown is-hoverable">
        <NavLink
          className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
          end={true}
          to={`/incident/${incidentState.incident.id}/journal/view`}
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
  }

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) =>
          `navbar-item is-capitalized${isActive ? " is-active has-text-dark" : ""}`
        }
        end={true}
        to={`/incident/${incidentState.incident.id}/journal/${incidentState.journal.id}/edit`}
      >
        <span className="icon-text is-capitalized">
          <span className="icon">
            <FontAwesomeIcon icon={faBars} />
          </span>
          <span>
            {t("journal")} {incidentState.journal.name}
          </span>
        </span>
      </NavLink>
      <div className="navbar-dropdown">
        <NavLink
          className={({ isActive }) =>
            `navbar-item is-capitalized${isActive ? " is-active has-text-dark" : ""}`
          }
          to={`/incident/${incidentState.incident.id}/journal/view`}
        >
          <span className="icon-text is-capitalized">
            <span className="icon">
              <FontAwesomeIcon icon={faRectangleList} />
            </span>
            <span>{t("overview")}</span>
          </span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            `navbar-item is-capitalized${isActive ? " is-active has-text-dark" : ""}`
          }
          end={true}
          to={`/incident/${incidentState.incident.id}/journal/${incidentState.journal.id}`}
        >
          <span className="icon-text is-capitalized is-flex-wrap-nowrap">
            <span className="icon">
              <FontAwesomeIcon icon={faFeed} />
            </span>
            <span>{t("journalFeed")}</span>
          </span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            `navbar-item is-capitalized${isActive ? " is-active has-text-dark" : ""}`
          }
          end={true}
          to={`/incident/${incidentState.incident.id}/journal/${incidentState.journal.id}/edit`}
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
  const { incidentId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
        to={`/incident/${incidentId}/tasks`}
      >
        <span className="icon-text is-capitalized is-flex-wrap-nowrap">
          <span className="icon">
            <FontAwesomeIcon icon={faClipboard} />
          </span>
          <span>{t("tasksRequestOrders")}</span>
        </span>
      </NavLink>
      <div className="navbar-dropdown">
        <NavLink
          className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
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
          className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
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
          className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
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
  const { incidentId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
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
  const { incidentId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return;

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <NavLink
        className={({ isActive }) => `navbar-item${isActive ? " is-active has-text-dark" : ""}`}
        to={`/incident/${incidentId}/map`}
      >
        <span className="icon-text is-capitalized">
          <span className="icon">
            <FontAwesomeIcon icon={faMapLocationDot} />
          </span>
          <span>{t("map")}</span>
        </span>
      </NavLink>
    </div>
  );
};

export { ResourcesNavBar, TasksNavBar };

export default Navbar;
