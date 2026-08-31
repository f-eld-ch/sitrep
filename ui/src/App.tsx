import { lazy, Suspense, useEffect } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";

import "./App.scss";

import { ApolloProvider } from "@apollo/client/react";
import { default as client } from "client";
import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { IncidentContextProvider, UserProvider } from "utils";
import { Editor as IncidentEditor, List as IncidentList, New as IncidentNew } from "views/incident";
import { Editor as JournalEditor, List as JournalMessageList, New as JournalNew, Overview as JournalOverview } from "views/journal";
import { Layout, LayoutMarginLess } from "views/Layout";
import { List as ImmediateMeasuresList } from "views/measures/immediateMeasures";
import { List as RequestList } from "views/measures/requests";
import { List as TaskList } from "views/measures/tasks";
import { List as ResourcesList } from "views/resource";
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
        children: [
          {
            path: "edit",
            element: (
              <Layout>
                <IncidentEditor />
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
              { index: true, element: <JournalOverview /> },
              {
                path: "edit",
                element: (
                  <Layout>
                    <JournalEditor />
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
              { path: "new", element: <JournalNew /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "/", element: <Navigate to="/incident/list" /> },
]);

function App() {
  const { i18n } = useTranslation();
  dayjs.extend(LocalizedFormat);

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
    <UserProvider>
      <ApolloProvider client={client}>
        <FeatureFlagProvider>
          <IncidentContextProvider>
            <RouterProvider router={router} />
          </IncidentContextProvider>
        </FeatureFlagProvider>
      </ApolloProvider>
    </UserProvider>
  );
}

export default App;
