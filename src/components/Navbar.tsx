import React, {FunctionComponent,useState,useContext} from 'react';
import { faCog } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from 'classnames';

import logo from 'assets/logo.svg';
import { NavLink } from 'react-router-dom';
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
                <NavLink to="/" className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")}>
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
                        <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to="/incident/list" >
                            Ereignis
                        </NavLink>
                        <div className="navbar-dropdown">
                            <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to="/incident/list" >
                                Übersicht
                            </NavLink>
                            <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to="/incident/new" >
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
            <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to="/incident/{incident}" >
                GBT Einsatzübung 2021
            </NavLink>
            <div className="navbar-dropdown">
                <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to={"/incident/" + incident + "/dashboard"} >
                    Dashboard
                </NavLink>
                <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} end={true} to={"/incident/" + incident + "/journal/"+ journal } >
                    Journal
                </NavLink>
                <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to={"/incident/" + incident + "/journal/" + journal + "/edit"} >
                    Journal bearbeiten
                </NavLink>
                <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to={"/incident/" + incident + "/resources"} >
                    Mittel
                </NavLink>                    
                <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to={"/incident/" + incident + "/tasks"} >
                    Pendenzen / Anträge / Bedürfnisse
                </NavLink>   
                <NavLink className={({ isActive }) => "navbar-item" + (isActive ? " is-active" : "")} to={"/incident/" + incident + "/hotline"} >
                    Hotline
                </NavLink>
            </div>
        </div>
    );
}
  

export default Navbar;
