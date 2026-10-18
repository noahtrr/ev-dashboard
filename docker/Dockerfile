# syntax=docker/dockerfile:1

# Base images are pinned by digest through Renovate (pinDigests).
ARG NODE_BUILD_IMAGE=cgr.dev/chainguard/node:latest-dev
ARG RUNTIME_IMAGE=cgr.dev/chainguard/wolfi-base:latest

# ---- build: install dependencies and build the SvelteKit app ----
FROM ${NODE_BUILD_IMAGE} AS build
# Build stage only: needs root to install pnpm globally; the runtime image drops to UID 10001.
# hadolint ignore=DL3002
USER 0:0
WORKDIR /src
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install --global pnpm@10.28.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @ev-dashboard/web build

# ---- s6: fetch and verify s6-overlay ----
FROM ${RUNTIME_IMAGE} AS s6
ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.3.2
ARG S6_NOARCH_SHA256=5379750ed30a84bbd2e2dd74847ba6b5bd29cd0b2e3ea2ec58049b57eb2eda12
ARG S6_X86_64_SHA256=e6befcc96a437a3831386ecfc51808c5d3e939dc5fe3c02ae9284599e8aa2408
ARG S6_AARCH64_SHA256=b17f17a82e7a515c682a91edaf2ffdabb73f891981b6c1fd712115693a2f8b4c
# hadolint ignore=DL3018
RUN apk add --no-cache curl xz
SHELL ["/bin/ash", "-e", "-o", "pipefail", "-c"]
RUN case "$TARGETARCH" in \
		amd64) arch=x86_64; sum=$S6_X86_64_SHA256 ;; \
		arm64) arch=aarch64; sum=$S6_AARCH64_SHA256 ;; \
		*) echo "unsupported arch $TARGETARCH" >&2; exit 1 ;; \
	esac; \
	base="https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}"; \
	curl -fsSLo /tmp/noarch.tar.xz "$base/s6-overlay-noarch.tar.xz"; \
	curl -fsSLo /tmp/arch.tar.xz "$base/s6-overlay-${arch}.tar.xz"; \
	echo "$S6_NOARCH_SHA256  /tmp/noarch.tar.xz" | sha256sum -c -; \
	echo "$sum  /tmp/arch.tar.xz" | sha256sum -c -; \
	mkdir /s6root; \
	tar -C /s6root -Jxpf /tmp/noarch.tar.xz; \
	tar -C /s6root -Jxpf /tmp/arch.tar.xz

# ---- runtime ----
FROM ${RUNTIME_IMAGE}
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="EV Dashboard" \
	org.opencontainers.image.description="Self-hostable dashboard for electric vehicle data" \
	org.opencontainers.image.source="https://github.com/noahtrr/ev-dashboard" \
	org.opencontainers.image.licenses="MIT" \
	org.opencontainers.image.version="${APP_VERSION}"

# hadolint ignore=DL3018
RUN apk add --no-cache nodejs-22 caddy \
	&& addgroup -g 10001 app \
	&& adduser -D -H -u 10001 -G app -s /sbin/nologin app \
	&& mkdir -p /app /data /run \
	&& chown app:app /data /run

COPY --from=s6 /s6root/ /
COPY docker/rootfs/ /
COPY --from=build --chown=app:app /src/apps/web/build /app/build
COPY --from=build --chown=app:app /src/apps/web/package.json /app/package.json

ENV APP_VERSION=${APP_VERSION} \
	NODE_ENV=production \
	XDG_DATA_HOME=/data \
	XDG_CONFIG_HOME=/data \
	S6_KEEP_ENV=0 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=30000 \
	S6_VERBOSITY=1

USER 10001:10001
VOLUME ["/data"]
EXPOSE 8080/tcp 8443/tcp 8443/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/health"]

ENTRYPOINT ["/init"]
