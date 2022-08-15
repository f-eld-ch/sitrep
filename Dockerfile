FROM docker.io/library/node:18 as build-deps
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn
COPY . ./
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
ARG VERSION
ENV VERSION=${VERSION:-develop}
RUN yarn build

FROM quay.io/oauth2-proxy/oauth2-proxy:v7.3.0
ENV OAUTH2_PROXY_PROXY_WEBSOCKETS=true \
    OAUTH2_PROXY_PASS_AUTHORIZATION_HEADER=true
COPY --from=build-deps /usr/src/app/build /static

