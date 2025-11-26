// Layout.jsx
import { Footer, Navbar } from "components";
import type React from "react";
import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { UserContext } from "utils";
import { IncidentContextSetter } from "utils/IncidentContext";
import { Login } from "./Login";

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = (props: LayoutProps) => {
  const [searchParams] = useSearchParams();
  const { i18n } = useTranslation();
  const { state: userState } = useContext(UserContext);

  const lang = searchParams.get("lang");
  useEffect(() => {
    i18n.changeLanguage(lang || undefined);
  }, [lang, i18n]);

  if (!userState.isLoggedin) return <Login />;

  return (
    <>
      <IncidentContextSetter />
      <Navbar />
      <section className="columns is-mobile is-flex-direction-column is-gapless is-fullheight-with-navbar">
        <div className="column">
          <section className="section">{props.children}</section>
        </div>
        <div className="column is-narrow is-hidden-print">
          <Footer />
        </div>
      </section>
    </>
  );
};

export const LayoutMarginLess = (props: LayoutProps) => {
  const [searchParams] = useSearchParams();
  const { i18n } = useTranslation();
  const { state: userState } = useContext(UserContext);

  const lang = searchParams.get("lang");
  useEffect(() => {
    i18n.changeLanguage(lang || undefined);
  }, [lang, i18n]);

  if (!userState.isLoggedin) return <Login />;

  return (
    <>
      <IncidentContextSetter />
      <Navbar />
      <section className="columns is-mobile is-flex-direction-column is-gapless is-fullheight-with-navbar">
        <div className="column is-flex">{props.children}</div>
        <div className="column is-narrow is-hidden-print">
          <Footer />
        </div>
      </section>
    </>
  );
};
