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
import { clsx } from "clsx";
import { useMyGlobalRoles } from "api";
import { type FunctionComponent, useContext, useState } from "react";
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

  const incidentId = incidentState.incident?.id;
  const mobileItem = "flex items-center px-4 py-2 gap-2 capitalize w-full";
  const mobileSubItem = "flex items-center px-8 py-1.5 gap-2 text-sm capitalize w-full";

  return (
    <nav className="fixed inset-x-0 top-0 z-30 bg-bg text-base text-text print:hidden [&_a]:text-inherit">
      {/* Brand row — always visible, fixed height */}
      <div className="flex h-[2.75rem] items-stretch">
        <NavLink
          to="/"
          className={({ isActive }) =>
            clsx(
              "flex shrink-0 items-center px-3",
              isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
            )
          }
        >
          <img src={logo} alt="Logo" className="h-6 w-auto" />
        </NavLink>

        {/* Desktop menu — inline in brand row */}
        <div className="hidden flex-1 flex-row items-stretch lg:flex">
          {/* start */}
          <div className="flex flex-1 flex-row items-stretch">
            <div className="group relative flex items-stretch">
              <NavLink
                to={incidentId ? `/incident/${incidentId}/edit` : "/"}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2 px-3",
                    isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                  )
                }
              >
                <FontAwesomeIcon icon={faExplosion} />
                <span>
                  {incidentState.incident
                    ? `${t("incident")} ${incidentState.incident.name}`
                    : t("incident")}
                </span>
              </NavLink>
              <div className="absolute top-full left-0 z-50 hidden min-w-52 overflow-hidden rounded-b-xl border-t border-border bg-bg text-sm whitespace-nowrap text-text shadow-lg group-hover:block [&_a]:text-inherit">
                <NavLink
                  className={({ isActive }) =>
                    clsx(
                      "flex w-full items-center gap-2 px-4 py-2 capitalize",
                      isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                    )
                  }
                  to="/incident/list"
                >
                  <FontAwesomeIcon icon={faRectangleList} />
                  <span>{t("overview")}</span>
                </NavLink>
                <NavLink
                  className={({ isActive }) =>
                    clsx(
                      "flex w-full items-center gap-2 px-4 py-2 capitalize",
                      isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                    )
                  }
                  to="/incident/new"
                >
                  <FontAwesomeIcon icon={faCirclePlus} />
                  <span>{t("createIncident")}</span>
                </NavLink>
                {incidentState.incident && (
                  <NavLink
                    className={({ isActive }) =>
                      clsx(
                        "flex w-full items-center gap-2 px-4 py-2 capitalize",
                        isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                      )
                    }
                    to={`/incident/${incidentId}/edit`}
                  >
                    <FontAwesomeIcon icon={faPen} />
                    <span>{t("editIncident")}</span>
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
          className="ml-auto flex items-center px-3 lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={isMenuActive}
          onClick={(e) => {
            e.preventDefault();
            setIsMenuActive(!isMenuActive);
          }}
        >
          <FontAwesomeIcon icon={faCaretDown} />
        </button>
      </div>

      {/* Mobile menu — drops below brand row */}
      {isMenuActive && (
        <div
          id="navbarBasic"
          className="border-t border-border bg-bg py-1 text-sm shadow-lg lg:hidden"
          data-testid="navbar-menu"
        >
          {/* Incident */}
          <NavLink
            className={({ isActive }) =>
              clsx(
                mobileItem,
                isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
              )
            }
            to={incidentId ? `/incident/${incidentId}/edit` : "/"}
          >
            <FontAwesomeIcon icon={faExplosion} />
            <span>{t("incident")}</span>
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              clsx(
                mobileSubItem,
                isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
              )
            }
            to="/incident/list"
          >
            <FontAwesomeIcon icon={faRectangleList} />
            <span>{t("overview")}</span>
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              clsx(
                mobileSubItem,
                isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
              )
            }
            to="/incident/new"
          >
            <FontAwesomeIcon icon={faCirclePlus} />
            <span>{t("createIncident")}</span>
          </NavLink>
          {incidentState.incident && (
            <NavLink
              className={({ isActive }) =>
                clsx(
                  mobileSubItem,
                  isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                )
              }
              to={`/incident/${incidentId}/edit`}
            >
              <FontAwesomeIcon icon={faPen} />
              <span>{t("editIncident")}</span>
            </NavLink>
          )}
          {/* Journal */}
          {incidentId && (
            <>
              <NavLink
                className={({ isActive }) =>
                  clsx(
                    mobileItem,
                    isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                  )
                }
                to={`/incident/${incidentId}/journal/messages`}
              >
                <FontAwesomeIcon icon={faBars} />
                <span className="capitalize">{t("journal")}</span>
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  clsx(
                    mobileSubItem,
                    isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                  )
                }
                to={`/incident/${incidentId}/journal/messages`}
              >
                <FontAwesomeIcon icon={faFeed} />
                <span>{t("journalFeed")}</span>
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  clsx(
                    mobileSubItem,
                    isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                  )
                }
                to={`/incident/${incidentId}/journal/edit`}
              >
                <FontAwesomeIcon icon={faPen} />
                <span>{t("editor")}</span>
              </NavLink>
            </>
          )}
          {/* Map */}
          {incidentId && (
            <NavLink
              className={({ isActive }) =>
                clsx(
                  mobileItem,
                  isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                )
              }
              to={`/incident/${incidentId}/map`}
            >
              <FontAwesomeIcon icon={faMapLocationDot} />
              <span className="capitalize">{t("map")}</span>
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
      className="flex w-full items-center gap-2 px-4 py-2 hover:bg-bg-subtle"
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
      <div className="hidden items-center gap-2 px-3 text-sm lg:flex">
        <FontAwesomeIcon icon={faCalendar} />
        <span>{date}</span>
      </div>
      <div className="hidden items-center gap-2 px-3 text-sm lg:flex">
        <FontAwesomeIcon icon={faClock} />
        <span>{time}</span>
      </div>
    </>
  );
}

function VersionNavBar() {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
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
  const myRolesResult = useMyGlobalRoles(!userState.isLoggedin);
  const isAdmin = myRolesResult.status === "ready" && (myRolesResult.data?.grants ?? []).length > 0;

  if (!userState.isLoggedin) return;

  return (
    <>
      {/* Desktop: hover dropdown */}
      <div className="group relative hidden items-stretch lg:ml-3 lg:flex">
        <div className="flex cursor-pointer items-center gap-1.5 px-3">
          <FontAwesomeIcon icon={faCog} />
          <FontAwesomeIcon icon={faChevronDown} className="text-xs opacity-60" />
        </div>
        <div className="absolute top-full right-0 z-50 hidden min-w-52 rounded-b-xl border-t border-border bg-bg text-sm whitespace-nowrap text-text shadow-lg group-hover:block [&_a]:text-inherit">
          <VersionNavBar />
          <div className="flex items-center gap-2 px-4 py-2">
            <FontAwesomeIcon icon={faUser} />
            <span>{userState.email || userState.username}</span>
          </div>
          <DarkModeSwitcher />
          <LanguageSwitcher />
          <hr className="my-1 border-t border-border" />
          {isAdmin && (
            <NavLink
              className={({ isActive }) =>
                clsx(
                  "flex w-full items-center gap-2 px-4 py-2",
                  isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
                )
              }
              to="/admin/access"
            >
              <FontAwesomeIcon icon={faUserShield} />
              <span>Administration</span>
            </NavLink>
          )}
          <a
            className="flex w-full items-center gap-2 px-4 py-2 capitalize hover:bg-bg-subtle"
            href="/oauth2/sign_out"
            aria-label={t("logout")}
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
            <span>{t("logout")}</span>
          </a>
        </div>
      </div>
      {/* Mobile: inline items */}
      <div className="mt-1 flex flex-col border-t border-border pt-1 text-sm lg:hidden">
        <VersionNavBar />
        <div className="flex items-center gap-2 px-3 py-2">
          <FontAwesomeIcon icon={faUser} />
          <span>{userState.email || userState.username}</span>
        </div>
        <DarkModeSwitcher />
        <LanguageSwitcher />
        {isAdmin && (
          <NavLink
            className="flex items-center gap-2 px-3 py-2 hover:bg-bg-subtle"
            to="/admin/access"
          >
            <FontAwesomeIcon icon={faUserShield} />
            <span>Administration</span>
          </NavLink>
        )}
        <a
          className="flex items-center gap-2 px-3 py-2 capitalize hover:bg-bg-subtle"
          href="/oauth2/sign_out"
          aria-label={t("logout")}
        >
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
          clsx(
            "flex items-center gap-2 px-3 capitalize",
            isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
          )
        }
        to={`/incident/${incidentId}/journal/messages`}
      >
        <FontAwesomeIcon icon={faBars} />
        <span>{t("journal")}</span>
      </NavLink>
      <div className="absolute top-full left-0 z-50 hidden min-w-52 overflow-hidden rounded-b-xl border-t border-border bg-bg text-sm whitespace-nowrap text-text shadow-lg group-hover:block [&_a]:text-inherit">
        <NavLink
          className={({ isActive }) =>
            clsx(
              "flex w-full items-center gap-2 px-4 py-2 capitalize",
              isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
            )
          }
          to={`/incident/${incidentId}/journal/messages`}
        >
          <FontAwesomeIcon icon={faFeed} />
          <span>{t("journalFeed")}</span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            clsx(
              "flex w-full items-center gap-2 px-4 py-2 capitalize",
              isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
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
          clsx(
            "flex items-center gap-2 px-3 capitalize",
            isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
          )
        }
        to={`/incident/${incidentId}/tasks`}
      >
        <FontAwesomeIcon icon={faClipboard} />
        <span>{t("tasksRequestOrders")}</span>
      </NavLink>
      <div className="absolute top-full left-0 z-50 hidden min-w-52 overflow-hidden rounded-b-xl border-t border-border bg-bg text-sm whitespace-nowrap text-text shadow-lg group-hover:block [&_a]:text-inherit">
        <NavLink
          className={({ isActive }) =>
            clsx(
              "flex w-full items-center gap-2 px-4 py-2 capitalize",
              isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
            )
          }
          to={`/incident/${incidentId}/tasks`}
        >
          <FontAwesomeIcon icon={faClipboardCheck} />
          <span>{t("tasksOrders")}</span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            clsx(
              "flex w-full items-center gap-2 px-4 py-2 capitalize",
              isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
            )
          }
          to={`/incident/${incidentId}/requests`}
        >
          <FontAwesomeIcon icon={faClipboardQuestion} />
          <span>{t("requestsNeeds")}</span>
        </NavLink>
        <NavLink
          className={({ isActive }) =>
            clsx(
              "flex w-full items-center gap-2 px-4 py-2 capitalize",
              isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
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
        clsx(
          "flex items-center gap-2 px-3 capitalize",
          isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
        )
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
        clsx(
          "flex items-center gap-2 px-3 capitalize",
          isActive ? "bg-primary text-white! hover:bg-primary" : "hover:bg-bg-subtle",
        )
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
