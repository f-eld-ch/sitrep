import { ApolloClient, InMemoryCache } from '@apollo/client';

const client = new ApolloClient({
  uri: '/api/graph',
  cache: new InMemoryCache(),

});


export default client;