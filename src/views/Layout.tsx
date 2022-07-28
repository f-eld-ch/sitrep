// Layout.jsx
import React from "react";
import { Navbar, Footer } from "components";

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
        <section className="section">{props.children}</section>
      </div>
      <div className="column is-narrow is-hidden-print">
        <Footer />
      </div>
    </section>
  );
};
