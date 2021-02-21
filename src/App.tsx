import React from 'react';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link,
  Redirect
} from "react-router-dom";

import './App.scss';
import { Navbar, Footer } from 'components';
import { IncidentRouter } from 'routes';

import { ApolloProvider } from '@apollo/client';
import { default as client } from './client';

function App() {
  return (
    <ApolloProvider client={client}>
      <Router>
        <Navbar />
        <section className="section">
          <Switch>
            <Route path="/incident">
              <IncidentRouter />
            </Route>
            <Route path="/">
              <Redirect to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/dashboard" />
            </Route>
          </Switch>
        </section>
        <Footer />
      </Router>
    </ApolloProvider>
  );
}

export default App;
