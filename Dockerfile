FROM docker.io/library/node:19 as build-deps
WORKDIR /usr/src/app
COPY ui/package.json yarn.lock ./
RUN yarn
COPY ui ./
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
ARG VERSION
ENV VERSION=${VERSION:-develop}
RUN yarn build

FROM quay.io/oauth2-proxy/oauth2-proxy:v7.4.0
ENV OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_AUTHORIZATION_HEADER=true \
    OAUTH2_PROXY_SKIP_AUTH_ROUTES='^\/(manifest\.json|favicon\.ico|asset-manifest\.json|service-worker\.js\.map|service-worker\.js|robots\.txt|logo\d+\.png)' \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_ACCESS_TOKEN=true \
    OAUTH2_PROXY_HTTP_ADDRESS=:4180
COPY --from=build-deps /usr/src/app/build /static

