import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import './App.scss';
import { Navbar, Footer } from 'components';

import { List as JournalMessageList, Editor as JournalEditor, HotlineEditor} from 'views/journal';
import { List as IncidentList, Dashboard as IncidentDashboard } from 'views/incident';
import { List as ResourcesList } from 'views/resource';
import { List as TaskList } from 'views/tasks';
import { ApolloProvider } from '@apollo/client';
import { default as client } from './client';

function App() {

  return (
    <ApolloProvider client={client}>
      <Router>
        <Navbar />

        <section className="section">
          <Routes>
            
            <Route path="/incident">
              <Route path="list" element={<IncidentList />} />

              <Route path=":incidentId" >
                <Route path="dashboard" element={<IncidentDashboard />} />
                <Route path="journal" >
                  <Route path=":journalId/edit" element={<JournalEditor />} />
                  <Route path=":journalId" element={<JournalMessageList />} />  
                </Route>

                <Route path="resources" element={<ResourcesList />} />
                <Route path="tasks" element={<TaskList />} />
                <Route path="hotline" element={<HotlineEditor />} />
              </Route>

            </Route>
            <Route path="/" element={ <Navigate to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/dashboard" />} />
          </Routes>
        </section>
        <Footer />
      </Router>
    </ApolloProvider>
  );
}

export default App;
