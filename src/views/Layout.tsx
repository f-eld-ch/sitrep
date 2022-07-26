import React from "react";
import { Navbar, Footer } from "components";

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = (props: LayoutProps) => {
  return (
    <div>
      <Navbar />
      <section className="section">{props.children}</section>
      <Footer />
    </div>
  );
};
