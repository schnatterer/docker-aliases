FROM node:12.13.0-alpine3.10 as node

FROM node as builder
ARG DOCKER_VERSION=19.03.5
RUN mkdir /dist

WORKDIR /work

RUN wget -qc -O docker.tgz "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz"
RUN tar -xzf docker.tgz
RUN mv docker/docker /dist

COPY package.json .
COPY yarn.lock .
RUN yarn install
RUN mv node_modules /dist

COPY createAliases.js /dist


FROM node

ENV PATH="/app:${PATH}"
COPY --chown=node:node --from=builder /dist /app
USER node
ENTRYPOINT ["node", "/app/createAliases.js"]