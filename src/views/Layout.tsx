// Layout.jsx
import React from "react";
import { Navbar, Footer } from "components";
import { Breadcrump } from "components/Breadcrumb";

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = (props: LayoutProps) => {
  return (
    <section className="columns is-flex-direction-column is-fullheight">
      <div className="column is-narrow is-hidden-print">
        <Navbar />
      </div>
      <div className="column">
        <Breadcrump />
        <section className="section">{props.children}</section>
      </div>
      <div className="column is-narrow is-hidden-print">
        <Footer />
      </div>
    </section>
  );
};
