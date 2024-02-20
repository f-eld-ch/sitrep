import { ApolloClient, InMemoryCache } from "@apollo/client";

import { HttpLink } from "@apollo/client";

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL,
  credentials: "include",
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
  // defaultOptions: {
  //   watchQuery: {
  //     nextFetchPolicy: "cache-and-network",
  //   },
  // },
});

export default client;
