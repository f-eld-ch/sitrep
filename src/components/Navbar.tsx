import React, {FunctionComponent,useState,useContext} from 'react';
import { faCog } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from 'classnames';

import logo from 'assets/logo.svg';
import { Link, NavLink, useParams } from 'react-router-dom';
import {IncidentContext, JournalContext} from 'contexts';

type NavbarProps = {}

const Navbar:FunctionComponent<{ isActive?: boolean }> = ({ isActive = false }) => {
    const [isMenuActive, setIsMenuActive] = useState<boolean>(isActive);

    const navbarMenuClass = classNames({
        'navbar-menu' : true,
        'is-active': isMenuActive,
    });

    return (
        <nav className="navbar is-fixed-top">
            <div className="navbar-brand">
                <NavLink to="/" className="navbar-item">
                    <figure className="image is-16x16" >
                        <img src={logo} alt="Logo" className="is-rounded"/>
                    </figure>
                </NavLink> 
                <a role="button" className="navbar-burger burger" aria-label="menu" aria-expanded="false" data-target="navbarBasic"
                onClick={(e) => { e.preventDefault(); setIsMenuActive(!isMenuActive);}}>
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
                </a>
            </div>
    
            <div className={navbarMenuClass}>
                <div className="navbar-start">
                    <div className="navbar-item has-dropdown is-hoverable">
                        <NavLink className="navbar-item" to="/incident/list" activeClassName="is-active">
                            Ereignis
                        </NavLink>
                        <div className="navbar-dropdown">
                            <NavLink className="navbar-item" to="/incident/list" activeClassName="is-active">
                                Übersicht
                            </NavLink>
                            <NavLink className="navbar-item" to="/incident/new" activeClassName="is-active">
                                Neues Ereignis erstellen
                            </NavLink>

                        </div>
                    </div>
                    <IncidentNavItem />
                </div>
                <div className="navbar-end">
                    <div className="navbar-item has-dropdown is-hoverable is-left">
                        <a className="navbar-link" > 
                            <FontAwesomeIcon icon={faCog} />
                        </a>
                        <div className="navbar-dropdown">
                        <a className="navbar-item" href="https://bulma.io/documentation/overview/start/">
                            Profil
                        </a>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}

interface IRouteParams {
    incidentId: string,
}

const IncidentNavItem:FunctionComponent = () => {
    const incident = useContext(IncidentContext);
    const journal = useContext(JournalContext);

    return (
        <div className="navbar-item has-dropdown is-hoverable">
            <NavLink className="navbar-item" to="/incident/{incident}" activeClassName="is-active">
                GBT Einsatzübung 2021
            </NavLink>
            <div className="navbar-dropdown">
                <NavLink className="navbar-item" to={"/incident/" + incident + "/dashboard"} activeClassName="is-active">
                    Dashboard
                </NavLink>
                <NavLink className="navbar-item" exact={true} to={"/incident/" + incident + "/journal/"+ journal } activeClassName="is-active">
                    Journal
                </NavLink>
                <NavLink className="navbar-item" to={"/incident/" + incident + "/journal/" + journal + "/edit"} activeClassName="is-active">
                    Journal bearbeiten
                </NavLink>
                <NavLink className="navbar-item" to={"/incident/" + incident + "/resources"} activeClassName="is-active">
                    Mittel
                </NavLink>                    
                <NavLink className="navbar-item" to={"/incident/" + incident + "/tasks"} activeClassName="is-active">
                    Pendenzen / Anträge / Bedürfnisse
                </NavLink>   
                <NavLink className="navbar-item" to={"/incident/" + incident + "/hotline"} activeClassName="is-active">
                    Hotline
                </NavLink>
            </div>
        </div>
    );
}
  

export default Navbar;
