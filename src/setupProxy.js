const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/v1/graphql",
    createProxyMiddleware({
      target: "http://localhost:8080",
      logLevel: "debug",
      changeOrigin: false,
      ws: true,
    })
  );
};
