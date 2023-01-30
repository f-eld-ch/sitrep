const { createProxyMiddleware, loggerPlugin } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/v1/graphql",
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
