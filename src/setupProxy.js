const { createProxyMiddleware, loggerPlugin } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/v1/graphql",
    createProxyMiddleware({
      logger: console,
      target: "http://localhost:4180",
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
      target: "http://localhost:4180",
      changeOrigin: true,
      plugins: [loggerPlugin],
      debug: true,
    })
  );
};
