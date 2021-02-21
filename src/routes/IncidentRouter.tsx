import React from 'react';
import {
    Switch,
    Route,
    useRouteMatch,
  } from "react-router-dom";
import { List as JournalMessageList, Editor as JournalEditor, HotlineEditor} from 'views/journal';
import { List as IncidentList, Dashboard as IncidentDashboard } from 'views/incident';
import { List as ResourcesList } from 'views/resource';
import { List as TaskList } from 'views/tasks';


function IncidentRouter() {
    let match = useRouteMatch();
  return (
    <Switch>
      <Route path={`${match.path}/:incidentId/dashboard`} component={IncidentDashboard} />
      <Route path={`${match.path}/:incidentId/journal/:journalId/edit`}   component={JournalEditor} />
      <Route path={`${match.path}/:incidentId/journal/:journalId`}   component={JournalMessageList} />
      <Route path={`${match.path}/:incidentId/resources`}   component={ResourcesList} />
      <Route path={`${match.path}/:incidentId/tasks`}   component={TaskList} />
      <Route path={`${match.path}/:incidentId/hotline`}   component={HotlineEditor} />


      <Route path={`${match.path}/list`} component={IncidentList} />
      {/* <Route path={`${match.path}/new`} component={Create} /> */}
      <Route path={match.path} component={IncidentList} />
    </Switch>
  );
}

export default IncidentRouter;
