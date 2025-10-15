import { ApolloClient, HttpLink } from "@apollo/client";
import { LocalState } from "@apollo/client/local-state";
import { cache } from "cache";

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL,
  credentials: "include",
});

const client = new ApolloClient({
  // defaultOptions: {
  //   watchQuery: {
  //     nextFetchPolicy: "cache-and-network",
  //   },
  // },
  cache: cache,

  link: httpLink,

  /*
  Inserted by Apollo Client 3->4 migration codemod.
  If you are not using the `@client` directive in your application,
  you can safely remove this option.
  */
  localState: new LocalState({}),
});

export default client;
