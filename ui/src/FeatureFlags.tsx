import { FliptWebProvider } from "@openfeature/flipt-web-provider";
import { OpenFeature, OpenFeatureProvider } from "@openfeature/react-sdk";
import { type PropsWithChildren, useContext, useEffect } from "react";

import { UserContext } from "utils";

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
    const context = {
      targettingKey: userState.email,
      domain: document.location.host.split(":")[0],
      email: userState.email,
    };
    OpenFeature.setContext(context);
  }, [userState]);

  return <OpenFeatureProvider>{children}</OpenFeatureProvider>;
};

export { Provider };
