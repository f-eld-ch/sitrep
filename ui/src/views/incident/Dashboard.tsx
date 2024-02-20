import { useQuery } from "@apollo/client";
import { Spinner } from "components";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { IncidentDetailsData, IncidentDetailsVars } from "types";
import { GetIncidentDetails } from "./graphql";

function MapFrame() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((seconds) => seconds + 60);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <iframe
      key={seconds}
      title="Karte"
      height="1000vh"
      src="https://map.geo.admin.ch/embed.html?lang=de&topic=ech&bgLayer=ch.swisstopo.pixelkarte-farbe&layers=ch.swisstopo.zeitreihen,ch.bfs.gebaeude_wohnungs_register,ch.bav.haltestellen-oev,ch.swisstopo.swisstlm3d-wanderwege,KML%7C%7Chttps:%2F%2Fpublic.geo.admin.ch%2Fx20-T-HaRN2B1HBQK8UKBg&layers_opacity=1,1,1,0.8,1&layers_visibility=false,false,false,false,true&layers_timestamp=18641231,,,,&E=2605883.78&N=1216144.64&zoom=10"
    />
  );
}


function Dashboard() {
  const { incidentId } = useParams();

  const { loading, error, data } = useQuery<IncidentDetailsData, IncidentDetailsVars>(GetIncidentDetails, {
    variables: { incidentId: incidentId || "" },
  });

  if (error) return <div className="notification is-danger">{error.message}</div>;

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="container is-fluid has-text-centered mb-4">
        <h1 className="title is-1 ">{data?.incidentsByPk.name}</h1>
      </div>
      <div className="tile is-ancestor">
        <div className="tile is-3 is-vertical is-parent">
          <div className="tile is-child box has-background-danger has-text-white-bis has-text-centered">
            <h2 className="title has-text-white-bis">Personen</h2>
            <nav className="level is-block">
              <div className="level-item has-text-centered">
                <div className="mb-4">
                  <p className="heading is-size-6">Tote</p>
                  <p className="subtitle is-size-3 has-text-white-bis">99999</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div className="mb-4">
                  <p className="heading is-size-6">Verletzte</p>
                  <p className="subtitle is-size-3 has-text-white-bis">9999</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div className="mb-4">
                  <p className="heading is-size-6">Eingeschlossene</p>
                  <p className="subtitle is-size-3 has-text-white-bis">9999</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div className="">
                  <p className="heading is-size-6">Obdachlose</p>
                  <p className="subtitle is-size-3 has-text-white-bis">9999</p>
                </div>
              </div>
            </nav>
          </div>
          <div className="tile is-child box has-background-info has-text-white-bis has-text-centered">
            <h2 className="title has-text-white-bis">Mittel</h2>
            <nav className="level is-block">
              <div className="level-item has-text-centered has-text-white-bis">
                <div className="mb-4">
                  <p className="heading is-size-6">Feuerwehr</p>
                  <p className="subtitle is-size-3 has-text-white-bis">9999</p>
                </div>
              </div>
              <div className="level-item has-text-centered has-text-white-bis">
                <div className="mb-4">
                  <p className="heading is-size-6">Polizei</p>
                  <p className="subtitle is-size-3 has-text-white-bis">9999</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div className="mb-4">
                  <p className="heading is-size-6">Technische Dienste</p>
                  <p className="subtitle is-size-3 has-text-white-bis">9999</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div className="">
                  <p className="heading is-size-6">Zivilschutz</p>
                  <p className="subtitle is-size-3 has-text-white-bis">9999</p>
                </div>
              </div>
            </nav>
          </div>
        </div>
        <div className="tile is-vertical">
          <MapFrame />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
