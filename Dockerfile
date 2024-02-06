FROM quay.io/oauth2-proxy/oauth2-proxy:v7.5.1
ENV OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_AUTHORIZATION_HEADER=true \
    OAUTH2_PROXY_SKIP_AUTH_ROUTES='^\/(manifest\.json|favicon\.ico|asset-manifest\.json|service-worker\.js\.map|service-worker\.js|robots\.txt|logo\d+\.png)' \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_ACCESS_TOKEN=true \
    OAUTH2_PROXY_HTTP_ADDRESS=:4180
COPY ui/build /static