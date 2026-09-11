// Layout.jsx
import { Footer, Navbar } from "components";
import type React from "react";
import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { ReloadPrompt, UserContext } from "utils";
import { useIncidentSync } from "utils/IncidentContext";
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

  useIncidentSync();

  if (!userState.isLoggedin) return <Login />;

  return (
    <>
      <Navbar />
      <ReloadPrompt />
      <div className="flex flex-col min-h-[calc(100vh-2.75rem)]">
        <div className="flex-1">
          <div className="p-6">{props.children}</div>
        </div>
        <div className="shrink-0 print:hidden">
          <Footer />
        </div>
      </div>
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

  useIncidentSync();

  if (!userState.isLoggedin) return <Login />;

  return (
    <>
      <Navbar />
      <div className="flex flex-col min-h-[calc(100vh-2.75rem)]">
        <div className="flex flex-1">{props.children}</div>
        <div className="shrink-0 print:hidden">
          <Footer />
        </div>
      </div>
    </>
  );
};
