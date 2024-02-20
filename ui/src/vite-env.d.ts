/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

import { FC, SVGProps } from "react";

declare module "*.png";
declare module "*.jpeg";
declare module "*.jpg";
declare module "*.svg" {
  const content: FC<SVGProps<SVGElement>>;
  export default content;
}
