import { ApolloClient, InMemoryCache } from "@apollo/client";

import { HttpLink } from "@apollo/client";

const httpLink = new HttpLink({
  uri: '/api/v1/graphql',
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
