// Layout.jsx
import React from "react";
import { Navbar, Footer } from "components";
import { Breadcrumb } from "components/Breadcrumb";

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = (props: LayoutProps) => {
  return (
    <section className="columns is-flex-direction-column is-gapless is-fullheight">
      <div className="column is-narrow is-hidden-print">
        <Navbar />
      </div>
      <div className="column">
        <section className="section">
          <Breadcrumb />
          {props.children}
        </section>
      </div>
      <div className="column is-narrow is-hidden-print">
        <Footer />
      </div>
    </section>
  );
};
