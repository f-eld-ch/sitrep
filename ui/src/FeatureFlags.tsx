import { FliptWebProvider } from "@openfeature/flipt-web-provider";
import { OpenFeature, OpenFeatureProvider } from "@openfeature/react-sdk";
import { type PropsWithChildren, useContext, useEffect } from "react";

import { UserContext } from "utils";

export async function hashDomain(domain: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(domain));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const Provider = (props: PropsWithChildren) => {
  const { children } = props;
  const { state: userState } = useContext(UserContext);

  useEffect(() => {
    const fliptProvider = new FliptWebProvider(
      "sitrep-ui",
      {
        url: "https://flipt.sitrep.ch",
      },
      console,
    );
    OpenFeature.setProvider(fliptProvider);
  }, []);

  // sync the evaulation context here, so far only depends on domain and UserContext state
  useEffect(() => {
    const domain = document.location.host.split(":")[0];
    hashDomain(domain).then((domainHash) => {
        OpenFeature.setContext({
          targetingKey: userState.email,
          domain,
          domainHash,
          email: userState.email,
        });
      });
  }, [userState]);

  return <OpenFeatureProvider>{children}</OpenFeatureProvider>;
};

export { Provider };
