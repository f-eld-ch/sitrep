import React, { useEffect, useState } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import "./App.scss";

import {
  List as JournalMessageList,
  Editor as JournalEditor,
  HotlineEditor,
  Overview as JournalOverview,
} from "views/journal";
import {
  List as IncidentList,
  Dashboard as IncidentDashboard,
  New as IncidentNew,
  Editor as IncidentEditor,
} from "views/incident";
import { List as ResourcesList } from "views/resource";
import { List as TaskList } from "views/tasks";
import { ApolloProvider } from "@apollo/client";
import { default as client } from "./client";
import { Layout } from "views/Layout";
import { UserContext } from "utils";
import { UserState } from "types";

function App() {
  const [userState, setUserState] = useState<UserState>({ isLoggedin: false, email: "", username: "" });

  const setUserStateFromUserinfo = () => {
    fetch("/oauth2/userinfo", { credentials: "include" })
      .then((response) => {
        if (response.ok) return response.json();
        Promise.reject();
      })
      .then((userInfo) => {
        setUserState({ isLoggedin: true, email: userInfo.email, username: userInfo.user });
      })
      .catch(() => {
        setUserState({ isLoggedin: false, email: "", username: "" });
      });
  };

  useEffect(() => {
    setUserStateFromUserinfo();

    const interval = setInterval(() => {
      setUserStateFromUserinfo();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

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
                  path="dashboard"
                  element={
                    <Layout>
                      <IncidentDashboard />
                    </Layout>
                  }
                />
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
                          setEditorMessage={undefined}
                          setTriageMessage={undefined}
                        />
                      </Layout>
                    }
                  />
                  <Route
                    path=":journalId/hotline"
                    element={
                      <Layout>
                        <HotlineEditor />
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
                  path="tasks"
                  element={
                    <Layout>
                      <TaskList />
                    </Layout>
                  }
                />
              </Route>
            </Route>
            <Route path="/" element={<Navigate to="/incident/list" />} />
          </Routes>
        </Router>
      </ApolloProvider>
    </UserContext.Provider>
  );
}

export default App;
