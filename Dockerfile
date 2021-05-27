FROM node:14.17.0-alpine3.13 as node

FROM node as builder
ARG DOCKER_VERSION=20.10.6
ARG DOCKER_BUILDX_VERSION=0.5.1
ARG DOCKER_APP_VERSION=0.9.1-beta3
ARG DOCKER_SCAN_VERSION=0.8.0
ARG COMPOSE_CLI_VERSION=1.0.16

RUN mkdir -p /dist/home/node/.docker/cli-plugins
RUN mkdir /dist/app

WORKDIR /work

# Install docker CLI
RUN mkdir -p /dist/usr/bin
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
RUN mv docker-app-plugin-linux /dist/home/node/.docker/cli-plugins/docker-app

# Install "docker scan" plugin
RUN wget https://github.com/docker/scan-cli-plugin/releases/download/v${DOCKER_SCAN_VERSION}/docker-scan_linux_amd64
RUN chmod +x docker-scan_linux_amd64
RUN mv docker-scan_linux_amd64 /dist/home/node/.docker/cli-plugins/docker-scan

# Install compose
RUN wget https://github.com/docker/compose-cli/releases/download/v${COMPOSE_CLI_VERSION}/docker-linux-amd64.tar.gz
RUN tar xzf docker-linux-amd64.tar.gz
RUN mkdir -p /dist/usr/local/bin
RUN install -m 775 docker/docker /dist/usr/local/bin/docker
RUN ln -s /usr/bin/docker /dist/usr/local/bin/com.docker.cli
RUN mv docker/docker-compose /dist/home/node/.docker/cli-plugins/docker-compose


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