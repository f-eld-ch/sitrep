import { ApolloClient } from "@apollo/client";
import { HttpLink } from "@apollo/client";
import { cache } from 'cache';

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL,
  credentials: "include",
});

const client = new ApolloClient({
  link: httpLink,
  cache: cache,
  // defaultOptions: {
  //   watchQuery: {
  //     nextFetchPolicy: "cache-and-network",
  //   },
  // },
});



export default client;
