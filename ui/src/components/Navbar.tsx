import { faCalendar, faClock } from "@fortawesome/free-regular-svg-icons";
import {
  faBars,
  faCaretDown,
  faChevronDown,
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
  faUserShield,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import logo from "assets/lockup-blue.svg";
import classNames from "classnames";
import { useMyGlobalRoles } from "api";
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

  const showResources = useBooleanFlagValue("show-resources", false);
  const showTasks = useBooleanFlagValue("show-tasks", false);

  // Reserves space for the fixed navbar — only relevant while Navbar is actually mounted
  // (not on the pre-login screen, which has no navbar).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("has-navbar-fixed-top");
    return () => root.classList.remove("has-navbar-fixed-top");
  }, []);

  const incidentId = incidentState.incident?.id;
  const mobileItem = "flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full";
  const mobileSubItem = "flex items-center px-8 py-1.5 gap-2 text-sm hover:bg-bg-subtle capitalize w-full";

  return (
    <nav
      className="fixed top-0 inset-x-0 z-30 bg-bg text-text text-base [&_a]:text-inherit print:hidden"
    >
      {/* Brand row — always visible, fixed height */}
      <div className="flex items-stretch" style={{ height: "2.75rem" }}>
        <NavLink
          to="/"
          className={({ isActive }) =>
            classNames("flex items-center px-3 shrink-0", isActive && "bg-primary !text-white")
          }
        >
          <img src={logo} alt="Logo" style={{ height: "1.5rem", width: "auto" }} />
        </NavLink>

        {/* Desktop menu — inline in brand row */}
        <div className="hidden lg:flex flex-1 flex-row items-stretch">
          {/* start */}
          <div className="flex flex-row items-stretch flex-1">
            <div className="group relative flex items-stretch">
              <NavLink
                to={incidentId ? `/incident/${incidentId}/edit` : "/"}
                className={({ isActive }) =>
                  classNames("flex items-center px-3 gap-2 hover:bg-bg-subtle", isActive && "bg-primary !text-white")
                }
              >
                <FontAwesomeIcon icon={faExplosion} />
                <span>{incidentState.incident ? `${t("incident")} ${incidentState.incident.name}` : t("incident")}</span>
              </NavLink>
              <div className="absolute top-full left-0 hidden group-hover:block bg-bg text-text text-sm border-t border-border shadow-lg min-w-52 z-50 rounded-b-xl whitespace-nowrap [&_a]:text-inherit">
                <NavLink className={({ isActive }) => classNames("flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full", isActive && "bg-primary !text-white")} to="/incident/list">
                  <FontAwesomeIcon icon={faRectangleList} /><span>{t("overview")}</span>
                </NavLink>
                <NavLink className={({ isActive }) => classNames("flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full", isActive && "bg-primary !text-white")} to="/incident/new">
                  <FontAwesomeIcon icon={faCirclePlus} /><span>{t("createIncident")}</span>
                </NavLink>
                {incidentState.incident && (
                  <NavLink className={({ isActive }) => classNames("flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full", isActive && "bg-primary !text-white")} to={`/incident/${incidentId}/edit`}>
                    <FontAwesomeIcon icon={faPen} /><span>{t("editIncident")}</span>
                  </NavLink>
                )}
              </div>
            </div>
            <JournalNavBar />
            {showResources && <ResourcesNavBar />}
            {showTasks && <TasksNavBar />}
            <MapNavBar />
          </div>
          {/* end */}
          <div className="flex flex-row items-stretch lg:ml-auto">
            <CurrentTime />
            <UserNavBar />
          </div>
        </div>

        {/* Burger */}
        <button
          type="button"
          className="flex items-center px-3 ml-auto lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={isMenuActive}
          onClick={(e) => { e.preventDefault(); setIsMenuActive(!isMenuActive); }}
        >
          <FontAwesomeIcon icon={faCaretDown} />
        </button>
      </div>

      {/* Mobile menu — drops below brand row */}
      {isMenuActive && (
        <div id="navbarBasic" className="lg:hidden bg-bg border-t border-border shadow-lg py-1 text-sm" data-testid="navbar-menu">
          {/* Incident */}
          <NavLink className={({ isActive }) => classNames(mobileItem, isActive && "bg-primary !text-white")} to={incidentId ? `/incident/${incidentId}/edit` : "/"}>
            <FontAwesomeIcon icon={faExplosion} /><span>{t("incident")}</span>
          </NavLink>
          <NavLink className={({ isActive }) => classNames(mobileSubItem, isActive && "bg-primary !text-white")} to="/incident/list">
            <FontAwesomeIcon icon={faRectangleList} /><span>{t("overview")}</span>
          </NavLink>
          <NavLink className={({ isActive }) => classNames(mobileSubItem, isActive && "bg-primary !text-white")} to="/incident/new">
            <FontAwesomeIcon icon={faCirclePlus} /><span>{t("createIncident")}</span>
          </NavLink>
          {incidentState.incident && (
            <NavLink className={({ isActive }) => classNames(mobileSubItem, isActive && "bg-primary !text-white")} to={`/incident/${incidentId}/edit`}>
              <FontAwesomeIcon icon={faPen} /><span>{t("editIncident")}</span>
            </NavLink>
          )}
          {/* Journal */}
          {incidentId && <>
            <NavLink className={({ isActive }) => classNames(mobileItem, isActive && "bg-primary !text-white")} to={`/incident/${incidentId}/journal/messages`}>
              <FontAwesomeIcon icon={faBars} /><span className="capitalize">{t("journal")}</span>
            </NavLink>
            <NavLink className={({ isActive }) => classNames(mobileSubItem, isActive && "bg-primary !text-white")} to={`/incident/${incidentId}/journal/messages`}>
              <FontAwesomeIcon icon={faFeed} /><span>{t("journalFeed")}</span>
            </NavLink>
            <NavLink className={({ isActive }) => classNames(mobileSubItem, isActive && "bg-primary !text-white")} to={`/incident/${incidentId}/journal/edit`}>
              <FontAwesomeIcon icon={faPen} /><span>{t("editor")}</span>
            </NavLink>
          </>}
          {/* Map */}
          {incidentId && (
            <NavLink className={({ isActive }) => classNames(mobileItem, isActive && "bg-primary !text-white")} to={`/incident/${incidentId}/map`}>
              <FontAwesomeIcon icon={faMapLocationDot} /><span className="capitalize">{t("map")}</span>
            </NavLink>
          )}
          {/* User settings */}
          <UserNavBar />
        </div>
      )}
    </nav>
  );
};

function DarkModeSwitcher() {
  const { isDarkMode, toggle } = useDarkMode();

  return (
    <button
      type="button"
      className="flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle w-full"
      aria-label={isDarkMode ? "Switch to light mode (Dark)" : "Switch to dark mode (Light)"}
      onClick={toggle}
    >
      <FontAwesomeIcon icon={isDarkMode ? faMoon : faSun} />
      <span>{isDarkMode ? "Dark" : "Light"}</span>
    </button>
  );
}

function CurrentTime() {
  const { time, date } = useDate();

  return (
    <>
      <div className="hidden lg:flex items-center px-3 gap-2 text-sm">
        <FontAwesomeIcon icon={faCalendar} />
        <span>{date}</span>
      </div>
      <div className="hidden lg:flex items-center px-3 gap-2 text-sm">
        <FontAwesomeIcon icon={faClock} />
        <span>{time}</span>
      </div>
    </>
  );
}

function VersionNavBar() {
  return (
    <div className="flex items-center px-4 py-2 gap-2">
      <FontAwesomeIcon icon={faCodeBranch} />
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
    </div>
  );
}

function UserNavBar() {
  const { state: userState } = useContext(UserContext);
  const { t } = useTranslation();
  const showRbacEditors = useBooleanFlagValue("show-rbac-editors", false);
  const myRolesResult = useMyGlobalRoles(!showRbacEditors || !userState.isLoggedin);
  const isAdmin =
    showRbacEditors &&
    myRolesResult.status === "ready" &&
    (myRolesResult.data?.grants ?? []).length > 0;

  if (!userState.isLoggedin) return;

  return (
    <>
    {/* Desktop: hover dropdown */}
    <div className="hidden lg:flex group relative items-stretch lg:ml-3">
      <div className="flex items-center px-3 gap-1.5 cursor-pointer">
        <FontAwesomeIcon icon={faCog} />
        <FontAwesomeIcon icon={faChevronDown} className="text-xs opacity-60" />
      </div>
      <div className="absolute top-full right-0 hidden group-hover:block bg-bg text-text text-sm border-t border-border shadow-lg min-w-52 z-50 rounded-b-xl whitespace-nowrap [&_a]:text-inherit">
        <VersionNavBar />
        <div className="flex items-center px-4 py-2 gap-2">
          <FontAwesomeIcon icon={faUser} />
          <span>{userState.email || userState.username}</span>
        </div>
        <DarkModeSwitcher />
        <LanguageSwitcher />
        <hr className="border-t border-border my-1" />
        {isAdmin && (
          <NavLink
            className={({ isActive }) =>
              classNames(
                "flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle w-full",
                isActive && "bg-primary !text-white",
              )
            }
            to="/admin/access"
          >
            <FontAwesomeIcon icon={faUserShield} />
            <span>Administration</span>
          </NavLink>
        )}
        <a
          className="flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full"
          href="/oauth2/sign_out"
          aria-label={t("logout")}
        >
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>{t("logout")}</span>
        </a>
      </div>
    </div>
    {/* Mobile: inline items */}
    <div className="flex flex-col lg:hidden border-t border-border mt-1 pt-1 text-sm">
      <div className="flex items-center px-3 py-2 gap-2">
        <FontAwesomeIcon icon={faUser} />
        <span>{userState.email || userState.username}</span>
      </div>
      <DarkModeSwitcher />
      <LanguageSwitcher />
      {isAdmin && (
        <NavLink className="flex items-center px-3 py-2 gap-2 hover:bg-bg-subtle" to="/admin/access">
          <FontAwesomeIcon icon={faUserShield} />
          <span>Administration</span>
        </NavLink>
      )}
      <a className="flex items-center px-3 py-2 gap-2 hover:bg-bg-subtle capitalize" href="/oauth2/sign_out" aria-label={t("logout")}>
        <FontAwesomeIcon icon={faRightFromBracket} />
        <span>{t("logout")}</span>
      </a>
    </div>
    </>
  );
}

const JournalNavBar: FunctionComponent = () => {
  const { t } = useTranslation();
  const { state: incidentState } = useContext(IncidentContext);

  if (!incidentState || !incidentState.incident) return;

  const incidentId = incidentState.incident.id;

  return (
    <div className="group relative flex items-stretch">
      <NavLink
        className={({ isActive }) =>
          classNames("flex items-center px-3 gap-2 hover:bg-bg-subtle capitalize", isActive && "bg-primary !text-white")
        }
        to={`/incident/${incidentId}/journal/messages`}
      >
        <FontAwesomeIcon icon={faBars} />
        <span>{t("journal")}</span>
      </NavLink>
      <div className="absolute top-full left-0 hidden group-hover:block bg-bg text-text text-sm border-t border-border shadow-lg min-w-52 z-50 rounded-b-xl whitespace-nowrap [&_a]:text-inherit">
        <NavLink
          className={({ isActive }) =>
            classNames(
              "flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full",
              isActive && "bg-primary !text-white",
            )
          }
          to={`/incident/${incidentId}/journal/messages`}
        >
          <FontAwesomeIcon icon={faFeed} />
          <span>{t("journalFeed")}</span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            classNames(
              "flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full",
              isActive && "bg-primary !text-white",
            )
          }
          to={`/incident/${incidentId}/journal/edit`}
        >
          <FontAwesomeIcon icon={faPen} />
          <span>{t("editor")}</span>
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
    <div className="group relative flex items-stretch">
      <NavLink
        className={({ isActive }) =>
          classNames("flex items-center px-3 gap-2 hover:bg-bg-subtle capitalize", isActive && "bg-primary !text-white")
        }
        to={`/incident/${incidentId}/tasks`}
      >
        <FontAwesomeIcon icon={faClipboard} />
        <span>{t("tasksRequestOrders")}</span>
      </NavLink>
      <div className="absolute top-full left-0 hidden group-hover:block bg-bg text-text text-sm border-t border-border shadow-lg min-w-52 z-50 rounded-b-xl whitespace-nowrap [&_a]:text-inherit">
        <NavLink
          className={({ isActive }) =>
            classNames(
              "flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full",
              isActive && "bg-primary !text-white",
            )
          }
          to={`/incident/${incidentId}/tasks`}
        >
          <FontAwesomeIcon icon={faClipboardCheck} />
          <span>{t("tasksOrders")}</span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            classNames(
              "flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full",
              isActive && "bg-primary !text-white",
            )
          }
          to={`/incident/${incidentId}/requests`}
        >
          <FontAwesomeIcon icon={faClipboardQuestion} />
          <span>{t("requestsNeeds")}</span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            classNames(
              "flex items-center px-4 py-2 gap-2 hover:bg-bg-subtle capitalize w-full",
              isActive && "bg-primary !text-white",
            )
          }
          to={`/incident/${incidentId}/soma`}
        >
          <FontAwesomeIcon icon={faClipboardList} />
          <span>{t("immediateMeasures")}</span>
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
    <NavLink
      className={({ isActive }) =>
        classNames("flex items-center px-3 gap-2 hover:bg-bg-subtle capitalize", isActive && "bg-primary !text-white")
      }
      to={`/incident/${incidentId}/resources`}
    >
      <FontAwesomeIcon icon={faTruckMedical} />
      <span>{t("resources")}</span>
    </NavLink>
  );
};

const MapNavBar: FunctionComponent = () => {
  const { incidentId } = useParams();
  const { t } = useTranslation();

  if (!incidentId) return;

  return (
    <NavLink
      className={({ isActive }) =>
        classNames("flex items-center px-3 gap-2 hover:bg-bg-subtle capitalize", isActive && "bg-primary !text-white")
      }
      to={`/incident/${incidentId}/map`}
    >
      <FontAwesomeIcon icon={faMapLocationDot} />
      <span>{t("map")}</span>
    </NavLink>
  );
};

export { ResourcesNavBar, TasksNavBar };

export default Navbar;
