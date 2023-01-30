// Layout.jsx
import React, { useEffect } from "react";
import { Navbar, Footer } from "components";
import { Breadcrumb } from "components/Breadcrumb";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = (props: LayoutProps) => {
  let [searchParams] = useSearchParams();
  const { i18n } = useTranslation();

  let lang = searchParams.get("lang");
  useEffect(() => {
    i18n.changeLanguage(lang || undefined)
  }, [lang, searchParams, i18n])

  return (
    <section className="columns is-mobile is-flex-direction-column is-gapless is-fullheight-with-navbar">
      <div className="column is-narrow is-hidden-print">
        <Navbar />
      </div>
      <div className="column is-narrow is-hidden-print">
        <Breadcrumb />
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
