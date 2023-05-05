import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";

import "./App.scss";

import {
  Editor as IncidentEditor,
  List as IncidentList,
  New as IncidentNew
} from "views/incident";
import {
  Editor as JournalEditor,
  List as JournalMessageList,
  New as JournalNew,
  Overview as JournalOverview
} from "views/journal";

import { List as ImmediateMeasuresList } from "views/measures/immediateMeasures";
import { List as RequestList } from "views/measures/requests";
import { List as TaskList } from "views/measures/tasks";
import { List as ResourcesList } from "views/resource";

import { ApolloProvider } from "@apollo/client";
import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { UserState } from "types";
import { UserContext } from "utils";
import MessageSheet from "views/journal/MessageSheet";
import { Layout } from "views/Layout";
import { default as client } from "./client";

const Map = lazy(() => import('views/map'));

function App() {
  const [userState, setUserState] = useState<UserState>({ isLoggedin: false, email: "", username: "" });
  const { i18n } = useTranslation();

  const setUserStateFromUserinfo = () => {
    fetch("/oauth2/userinfo", { credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("unauthenticated")
        }
        return response.json();
      })
      .then((userInfo) => {
        setUserState({ isLoggedin: true, email: userInfo.email, username: userInfo.user || userInfo.preferredUsername });
      })
      .catch(() => {
        setUserState({ isLoggedin: false, email: "", username: "" });
        // redirect to the login page of oAuth2Proxy
        window.location.replace('/oauth2/sign_in');
      });
  };


  useEffect(() => {
    setUserStateFromUserinfo();
    i18n.changeLanguage()

    const interval = setInterval(() => {
      setUserStateFromUserinfo();
    }, 10000);

    return () => clearInterval(interval);
  }, [i18n]);

  return (
    <UserContext.Provider value={userState}>
      <ApolloProvider client={client}>
        <Router>
          <Routes>
            <Route path="/incident">
              <Route
                path="list"
                element={
                  <Layout>
                    <IncidentList />
                  </Layout>
                }
              />
              <Route
                path="new"
                element={
                  <Layout>
                    <IncidentNew />
                  </Layout>
                }
              />

              <Route path=":incidentId">
                <Route
                  path="edit"
                  element={
                    <Layout>
                      <IncidentEditor />
                    </Layout>
                  }
                />

                <Route path="journal">
                  <Route
                    path="view"
                    element={
                      <Layout>
                        <JournalOverview />
                      </Layout>
                    }
                  />
                  <Route
                    path="new"
                    element={
                      <Layout>
                        <JournalNew />
                      </Layout>
                    }
                  />
                  <Route
                    path=":journalId/edit"
                    element={
                      <Layout>
                        <JournalEditor />
                      </Layout>
                    }
                  />
                  <Route
                    path=":journalId"
                    element={
                      <Layout>
                        <JournalMessageList
                          showControls={false}
                        />
                      </Layout>
                    }
                  />
                  <Route
                    path=":journalId/messages/:messageId"
                    element={
                      <Layout>
                        <MessageSheet />
                      </Layout>
                    }
                  />
                </Route>

                <Route
                  path="resources"
                  element={
                    <Layout>
                      <ResourcesList />
                    </Layout>
                  }
                />
                <Route
                  path="map"
                  element={
                    <Layout>
                      <Suspense fallback={<Spinner />} >
                        <Map />
                      </Suspense>
                    </Layout>
                  }
                />
                <Route
                  path="tasks"
                  element={
                    <Layout>
                      <TaskList />
                    </Layout>
                  }
                />
                <Route
                  path="requests"
                  element={
                    <Layout>
                      <RequestList />
                    </Layout>
                  }
                />
                <Route
                  path="soma"
                  element={
                    <Layout>
                      <ImmediateMeasuresList />
                    </Layout>
                  }
                />
              </Route>
            </Route>
            <Route path="/" element={<Navigate to="/incident/list" />} />
          </Routes>
        </Router>
      </ApolloProvider>
    </UserContext.Provider >
  );
}

export default App;
