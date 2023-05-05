const { createProxyMiddleware, loggerPlugin } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api/v1/graphql",
    createProxyMiddleware({
      logger: console,
      target: "http://localhost:8080",
      changeOrigin: true,
      // ws: true,
      plugins: [loggerPlugin],
      debug: true,
    })
  );
  app.use(
    "/oauth2",
    createProxyMiddleware({
      logger: console,
      target: "http://localhost:8080",
      changeOrigin: true,
      // ws: true,
      plugins: [loggerPlugin],
      debug: true,
    })
  );
};
