import React, {FunctionComponent,useState} from 'react';
import { faCog } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from 'classnames';

import logo from 'assets/logo.svg';
import { Link, NavLink, useParams } from 'react-router-dom';

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
    // const params = useParams<IRouteParams>();
    // console.log("found params", params)

    // if (!params.incidentId) {
    //     console.log("found incident", params.incidentId)
        return (
            <div className="navbar-item has-dropdown is-hoverable">
                <NavLink className="navbar-item" to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c" activeClassName="is-active">
                    GBT Einsatzübung 2021
                </NavLink>
                <div className="navbar-dropdown">
                    <NavLink className="navbar-item" to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/dashboard" activeClassName="is-active">
                        Dashboard
                    </NavLink>
                    <NavLink className="navbar-item" to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/journal/f4cce005-6c24-4923-8549-f1fba6bd806a" activeClassName="is-active">
                        Journal
                    </NavLink>
                    <NavLink className="navbar-item" to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/journal/f4cce005-6c24-4923-8549-f1fba6bd806a/edit" activeClassName="is-active">
                        Journal bearbeiten
                    </NavLink>
                    <NavLink className="navbar-item" to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/resources" activeClassName="is-active">
                        Mittel
                    </NavLink>                    
                    <NavLink className="navbar-item" to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/tasks" activeClassName="is-active">
                        Pendenzen / Anträge / Bedürfnisse
                    </NavLink>   
                    <NavLink className="navbar-item" to="/incident/6796c0d0-ddfa-4d81-870b-121200723e0c/hotline" activeClassName="is-active">
                        Hotline
                    </NavLink>
                </div>
            </div>
        );
    // }
    return <></>;}
  

export default Navbar;
