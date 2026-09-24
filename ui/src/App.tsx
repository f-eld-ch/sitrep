import { lazy, Suspense, useEffect } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";
import { ErrorBoundary } from "components/ErrorBoundary";
import { ErrorPage } from "views/ErrorPage";

import "./tailwind.css";

import { ApolloProvider } from "@apollo/client/react";
import { default as client } from "client";
import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { IncidentContextProvider, UserProvider } from "utils";
import { useDarkMode } from "utils/useDarkMode";
import { AdminLayout, DefaultAccess, GlobalRoles, GroupDetail, Groups } from "./views/admin";
import {
  Editor as IncidentEditor,
  Dashboard as IncidentDashboard,
  List as IncidentList,
  New as IncidentNew,
  AccessPage as IncidentAccessPage,
} from "views/incident";
import { List as JournalMessageList, TriageView as JournalTriageView } from "views/journal";
const JournalEditor = lazy(() => import("views/journal/Editor"));
import { Layout, LayoutMarginLess } from "views/Layout";
import { IncidentRoute } from "views/IncidentRoute";
import { List as ImmediateMeasuresList } from "views/measures/immediateMeasures";
import { List as RequestList } from "views/measures/requests";
import { List as TaskList } from "views/measures/tasks";
import { List as ResourcesList } from "views/resource";
import { List as CasualtiesList } from "views/casualties";
import { Provider as FeatureFlagProvider } from "./FeatureFlags";
import "./i18n";
import dayjs from "dayjs";
import de from "dayjs/locale/de";
import en from "dayjs/locale/en";
import fr from "dayjs/locale/fr";
import it from "dayjs/locale/it";
import LocalizedFormat from "dayjs/plugin/localizedFormat";

const MapView = lazy(() => import("views/map"));

const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/admin/access",
        element: (
          <Layout>
            <AdminLayout />
          </Layout>
        ),
        children: [
          { index: true, element: <Navigate to="groups" replace /> },
          { path: "groups", element: <Groups /> },
          { path: "groups/:groupId", element: <GroupDetail /> },
          { path: "global-roles", element: <GlobalRoles /> },
          { path: "default-access", element: <DefaultAccess /> },
        ],
      },
      {
        path: "/incident",
        children: [
          {
            path: "list",
            element: (
              <Layout>
                <IncidentList />
              </Layout>
            ),
          },
          {
            path: "new",
            element: (
              <Layout>
                <IncidentNew />
              </Layout>
            ),
          },
          {
            path: ":incidentId",
            element: <IncidentRoute />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              {
                path: "dashboard",
                element: (
                  <LayoutMarginLess>
                    <Suspense fallback={<Spinner />}>
                      <IncidentDashboard />
                    </Suspense>
                  </LayoutMarginLess>
                ),
              },
              {
                path: "edit",
                element: (
                  <Layout>
                    <IncidentEditor />
                  </Layout>
                ),
              },
              {
                // Not linked from the navbar; reachable only by direct URL.
                path: "access",
                element: (
                  <Layout>
                    <IncidentAccessPage />
                  </Layout>
                ),
              },
              {
                path: "resources",
                element: (
                  <Layout>
                    <ResourcesList />
                  </Layout>
                ),
              },
              {
                path: "casualties",
                element: (
                  <Layout>
                    <CasualtiesList />
                  </Layout>
                ),
              },
              {
                path: "map",
                element: (
                  <LayoutMarginLess>
                    <Suspense fallback={<Spinner />}>
                      <MapView />
                    </Suspense>
                  </LayoutMarginLess>
                ),
              },
              {
                path: "tasks",
                element: (
                  <Layout>
                    <TaskList />
                  </Layout>
                ),
              },
              {
                path: "requests",
                element: (
                  <Layout>
                    <RequestList />
                  </Layout>
                ),
              },
              {
                path: "soma",
                element: (
                  <Layout>
                    <ImmediateMeasuresList />
                  </Layout>
                ),
              },
              {
                path: "journal",
                children: [
                  { index: true, element: <Navigate to="edit" replace /> },
                  { path: "view", element: <Navigate to="../edit" replace /> },
                  {
                    path: "edit",
                    element: (
                      <Layout>
                        <Suspense fallback={<Spinner />}>
                          <JournalEditor />
                        </Suspense>
                      </Layout>
                    ),
                  },
                  {
                    path: "messages",
                    element: (
                      <Layout>
                        <JournalMessageList showControls={false} autoScroll={true} />
                      </Layout>
                    ),
                  },
                  {
                    path: "triage",
                    element: (
                      <LayoutMarginLess>
                        <JournalTriageView />
                      </LayoutMarginLess>
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: "/", element: <Navigate to="/incident/list" /> },
    ],
  },
]);

function App() {
  const { i18n } = useTranslation();
  dayjs.extend(LocalizedFormat);

  // Applies the stored theme preference to the document root regardless of route —
  // Navbar (and its toggle button) isn't mounted on the pre-login screen.
  useDarkMode();

  useEffect(() => {
    i18n.changeLanguage();
    const locale = (lang: string) => {
      switch (lang) {
        case "de":
          return de;
        case "en":
          return en;
        case "fr":
          return fr;
        case "it":
          return it;
        default:
          return en;
      }
    };
    const lang = locale(i18n.language);
    dayjs.locale(lang.name);
  }, [i18n.language, i18n]);

  return (
    <ErrorBoundary>
      <UserProvider>
        <ApolloProvider client={client}>
          <FeatureFlagProvider>
            <IncidentContextProvider>
              <RouterProvider router={router} />
            </IncidentContextProvider>
          </FeatureFlagProvider>
        </ApolloProvider>
      </UserProvider>
    </ErrorBoundary>
  );
}

export default App;
