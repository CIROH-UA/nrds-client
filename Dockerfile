# syntax=docker/dockerfile:1
#
# PROTOTYPE: NRDS portal image built on tethys-uvx (uv venv, no conda/salt/nginx/supervisor).
# Served by uvicorn on ${TETHYS_PORT} (8000) as uid 1000. Static files are NOT served by this
# container -- a reverse proxy serves them from STATIC_ROOT on the mounted persist volume.
#
# Base tags are pinned to a sha: tethys-uvx is young and its script/env contract still moves.

###############################################################################
# builder - React build + install the app into the base venv
###############################################################################
FROM ghcr.io/aquaveo/tethys-uvx:builder-a3148d5 AS builder

# React build-time config (was ENV in the conda-image Dockerfile)
ARG TETHYS_DEBUG_MODE=false
ARG TETHYS_LOADER_DELAY=500
ARG TETHYS_PORTAL_HOST=""
ARG TETHYS_APP_ROOT_URL="/"

WORKDIR /build

# npm deps first so the (slow) install layer caches independently of app source
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The repo ships development.env; production values are substituted in here.
RUN mv reactapp/config/development.env reactapp/config/production.env \
  && sed -i "s#TETHYS_DEBUG_MODE.*#TETHYS_DEBUG_MODE = ${TETHYS_DEBUG_MODE}#g" reactapp/config/production.env \
  && sed -i "s#TETHYS_LOADER_DELAY.*#TETHYS_LOADER_DELAY = ${TETHYS_LOADER_DELAY}#g" reactapp/config/production.env \
  && sed -i "s#TETHYS_PORTAL_HOST.*#TETHYS_PORTAL_HOST = ${TETHYS_PORTAL_HOST}#g" reactapp/config/production.env \
  && sed -i "s#TETHYS_APP_ROOT_URL.*#TETHYS_APP_ROOT_URL = ${TETHYS_APP_ROOT_URL}#g" reactapp/config/production.env \
  && npm run build

# to fix grype scan error
RUN git config --global --add safe.directory '*' \
  && uv pip install --no-cache -c conf/constraints.txt . django-analytical \
       "urllib3>=2" "cryptography>=50" "sqlparse>=0.6" \
  && chmod -R a+rX /opt/conda

###############################################################################
# runtime - slim base + the app-augmented venv
###############################################################################
FROM ghcr.io/aquaveo/tethys-uvx:runtime-base-a3148d5

# Patch the OS packages inherited from the base
USER root
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
USER 1000:1000

# Interpreter and venv must land at the same paths (pyvenv.cfg hardcodes /opt/python)
COPY --from=builder /opt/python /opt/python
COPY --from=builder /opt/conda  /opt/conda

# Declarative portal settings (replaces salt/patches.sls) + per-environment config hooks
COPY --chown=1000:1000 conf/portal_config.yml /config/portal_config.yml
COPY --chown=1000:1000 conf/portal-config.d/ /opt/portal/portal-config.d/

# Provision wrapper that can bootstrap an empty DB (see the script for why)
COPY --chmod=0755 conf/bootstrap-provision.sh /usr/local/bin/bootstrap-provision.sh

HEALTHCHECK --start-period=60s --interval=30s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:8000/ || exit 1

# CMD (serve.sh) is inherited from the base
