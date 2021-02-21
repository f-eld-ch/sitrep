import React from 'react';
import faker from "faker/locale/de";

import { JournalMessage } from '../../components';
import { MessageStatus as Status } from '../../types';


const tenSentences = () => faker.lorem.paragraphs(1)

function Dashboard() {
  return (
    <div>
        <div className="container is-fluid has-text-centered mb-4">
            <h1 className="title is-1 ">GBT Einsatzübung 2021</h1>
        </div>
        <div className="tile is-ancestor">
            <div className="tile is-3 is-vertical is-parent">
                <div className="tile is-child box has-background-danger has-text-white-bis has-text-centered">
                <h2 className="title has-text-white-bis">Personen</h2>
                    <nav className="level is-block">
                       <div className="level-item has-text-centered">
                            <div className="mb-4">
                            <p className="heading is-size-6" >Tote</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div>
                        <div className="level-item has-text-centered">
                            <div className="mb-4">
                            <p className="heading is-size-6" >Verletzte</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div>
                        <div className="level-item has-text-centered">
                            <div className="mb-4">
                            <p className="heading is-size-6">Eingeschlossene</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div>
                        <div className="level-item has-text-centered">
                            <div className="">
                            <p className="heading is-size-6">Obdachlose</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div>
                    </nav>       
                </div>
                <div className="tile is-child box has-background-info has-text-white-bis has-text-centered">
                    <h2 className="title has-text-white-bis">Mittel</h2>
                    <nav className="level is-block">
                       <div className="level-item has-text-centered has-text-white-bis">
                            <div className="mb-4">
                            <p className="heading is-size-6" >Feuerwehr</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div>
                        <div className="level-item has-text-centered has-text-white-bis">
                            <div className="mb-4">
                            <p className="heading is-size-6" >Polizei</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div>
                        <div className="level-item has-text-centered">
                            <div className="mb-4">
                            <p className="heading is-size-6">Technische Dienste</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div> 
                        <div className="level-item has-text-centered">
                            <div className="">
                            <p className="heading is-size-6">Zivilschutz</p>
                            <p className="subtitle is-size-3 has-text-white-bis">{faker.random.number(30)}</p>
                            </div>
                        </div>
                    </nav>   
                </div>
            </div>
            <div className="tile is-vertical is-parent">
                <div className="tile is-child hero">
                    <iframe  height="400vh" src="https://map.geo.admin.ch/embed.html?lang=de&topic=ech&bgLayer=ch.swisstopo.pixelkarte-farbe&layers=ch.swisstopo.zeitreihen,ch.bfs.gebaeude_wohnungs_register,ch.bav.haltestellen-oev,ch.swisstopo.swisstlm3d-wanderwege,KML%7C%7Chttps:%2F%2Fpublic.geo.admin.ch%2Fx20-T-HaRN2B1HBQK8UKBg&layers_opacity=1,1,1,0.8,1&layers_visibility=false,false,false,false,true&layers_timestamp=18641231,,,,&E=2605883.78&N=1216144.64&zoom=10" />
                </div>
                <div className="tile is-child box">
                    <div className="container is-fluid">
                        <h2 className="title is-4">Schlüsselnachrichten</h2>
                        <JournalMessage assignments={["Lage", "Pol"]} status={Status.Important} sender={faker.name.findName()} receiver={faker.name.findName()} message={tenSentences()}  timeDate={faker.date.recent(1)}/>
                        <JournalMessage assignments={["ZS", "San"]} status={Status.Important} sender={faker.name.findName()} receiver={faker.name.findName()} message={tenSentences()}  timeDate={faker.date.recent(1)}/>
                        <JournalMessage assignments={["Pol", "ZS", "San"]}status={Status.Important} sender={faker.name.findName()} receiver={faker.name.findName()} message={tenSentences()}  timeDate={faker.date.recent(1)}/>
                    </div>
                </div>
            </div>

        </div>
    </div>
  );
}

export default Dashboard;
