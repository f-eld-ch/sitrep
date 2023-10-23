FROM docker.io/library/node:21 as build-deps
WORKDIR /usr/src/app
COPY yarn.lock package.json .yarnrc.yml ./
COPY .yarn ./.yarn
RUN find ./
RUN yarn install --immutable
COPY . ./
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
ARG VERSION
ENV VERSION=${VERSION:-develop}
RUN yarn build

FROM quay.io/oauth2-proxy/oauth2-proxy:v7.5.1
ENV OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_AUTHORIZATION_HEADER=true \
    OAUTH2_PROXY_SKIP_AUTH_ROUTES='^\/(manifest\.json|favicon\.ico|asset-manifest\.json|service-worker\.js\.map|service-worker\.js|robots\.txt|logo\d+\.png)' \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_ACCESS_TOKEN=true \
    OAUTH2_PROXY_HTTP_ADDRESS=:4180
COPY --from=build-deps /usr/src/app/build /static

