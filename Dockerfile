FROM node:14.17.0-alpine3.13 as node

FROM node as builder
ARG DOCKER_VERSION=20.10.6
ARG DOCKER_BUILDX_VERSION=0.5.1
ARG DOCKER_APP_VERSION=0.9.1-beta3

RUN mkdir -p /dist/usr/bin
RUN mkdir -p /dist/home/node/.docker/cli-plugins
RUN mkdir /dist/app

WORKDIR /work

# Install docker CLI
RUN wget -qc -O docker.tgz "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz"
RUN tar -xzf docker.tgz
RUN mv docker/docker /dist/usr/bin/

# Install buildx
RUN wget -O docker-buildx https://github.com/docker/buildx/releases/download/v${DOCKER_BUILDX_VERSION}/buildx-v0.5.1.linux-amd64
RUN chmod a+x docker-buildx
RUN mv docker-buildx /dist/home/node/.docker/cli-plugins/

# Install "docker app" plugin
RUN wget https://github.com/docker/app/releases/download/v${DOCKER_APP_VERSION}/docker-app-linux.tar.gz
RUN tar xzf docker-app-linux.tar.gz
RUN cp docker-app-plugin-linux /dist/home/node/.docker/cli-plugins/docker-app

COPY package.json .
COPY yarn.lock .
RUN yarn install
RUN mv node_modules /dist/app

COPY createAliases.js /dist/app
COPY package.json /dist/app


FROM node

ENV PATH="/app:${PATH}"
COPY --chown=node:node --from=builder /dist /
USER node
ENTRYPOINT ["node", "/app/createAliases.js"]