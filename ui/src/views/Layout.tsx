// Layout.jsx
import { Footer, Navbar } from "components";
import React, { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { UserContext, ReloadPrompt } from "utils";
import { Login } from "./Login";

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = (props: LayoutProps) => {
  let [searchParams] = useSearchParams();
  const { i18n } = useTranslation();
  const userState = useContext(UserContext);

  let lang = searchParams.get("lang");
  useEffect(() => {
    i18n.changeLanguage(lang || undefined);
  }, [lang, searchParams, i18n]);

  if (!userState.isLoggedin) return <Login />;

  return (
    <section className="columns is-mobile is-flex-direction-column is-gapless is-fullheight-with-navbar">
      <div className="column is-narrow is-hidden-print">
        <Navbar />
      </div>
      <div className="column is-narrow is-hidden-print">
        <ReloadPrompt />
      </div>
      <div className="column">
        <section className="section">{props.children}</section>
      </div>
      <div className="column is-narrow is-hidden-print">
        <Footer />
      </div>
    </section>
  );
};
