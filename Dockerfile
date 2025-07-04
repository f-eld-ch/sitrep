FROM quay.io/oauth2-proxy/oauth2-proxy:v7.9.0@sha256:37c1570c0427e02fc7c947ef2c04e8995b8347b7abc9fcf1dbb4e376a4b221a7
ENV OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_AUTHORIZATION_HEADER=true \
    OAUTH2_PROXY_SKIP_AUTH_ROUTES='^\/(manifest\.json|favicon\.ico|asset-manifest\.json|service-worker\.js\.map|service-worker\.js|robots\.txt|logo\d+\.png)' \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_ACCESS_TOKEN=true \
    OAUTH2_PROXY_HTTP_ADDRESS=:4180
COPY ui/build /static