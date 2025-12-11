
FROM tethysplatform/tethys-core:dev-py3.12-dj5.2 


###################
# BUILD ARGUMENTS #
###################

ARG MICRO_TETHYS=true \
    MAMBA_DOCKERFILE_ACTIVATE=1


#########################
# ADD APPLICATION FILES #
#########################
COPY . ${TETHYS_HOME}/apps/nrds
COPY run.sh ${TETHYS_HOME}/run.sh

###############
# ENVIRONMENT #
###############
ENV TETHYS_DB_ENGINE=django.db.backends.sqlite3
ENV SKIP_DB_SETUP=True
ENV TETHYS_DB_NAME=
ENV TETHYS_DB_USERNAME=
ENV TETHYS_DB_PASSWORD=
ENV TETHYS_DB_HOST=
ENV TETHYS_DB_PORT=
ENV ENABLE_OPEN_PORTAL=True
ENV MULTIPLE_APP_MODE=False
ENV STANDALONE_APP=nrds
ENV PORTAL_SUPERUSER_NAME=admin
ENV PORTAL_SUPERUSER_PASSWORD=pass
ENV PROJ_LIB=/opt/conda/envs/tethys/share/proj

ENV NVM_DIR=/usr/local/nvm
ENV NODE_VERSION=24.4.1
ENV NODE_VERSION_DIR=${NVM_DIR}/versions/node/v${NODE_VERSION}
ENV NODE_PATH=${NODE_VERSION_DIR}/lib/node_modules
ENV PATH=${NODE_VERSION_DIR}/bin:$PATH
ENV NPM=${NODE_VERSION_DIR}/bin/npm
ENV PDM="/root/.local/bin/pdm"
ENV APP_SRC_ROOT=${TETHYS_HOME}/apps/nrds

ENV DEV_REACT_CONFIG="${APP_SRC_ROOT}/reactapp/config/development.env"
ENV PROD_REACT_CONFIG="${APP_SRC_ROOT}/reactapp/config/production.env"
ENV TETHYS_DEBUG_MODE="false"
ENV TETHYS_APP_PACKAGE=nrds
ENV TETHYS_APP_ROOT_URL="/"
ENV TETHYS_LOADER_DELAY=500
ENV TETHYS_PORTAL_HOST=""

# SETUP
RUN mkdir -p ${NVM_DIR} \
    && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | /bin/bash \
    && . ${NVM_DIR}/nvm.sh \
    && nvm install ${NODE_VERSION} \
    && nvm alias default ${NODE_VERSION} \
    && nvm use default \
    && ls -la ${NODE_VERSION_DIR} \
    && ls -la ${NODE_VERSION_DIR}/lib \
    && pip install --user pdm \
    && ${PDM} self update \
    && cd ${APP_SRC_ROOT} \ 
    && git config --global --add safe.directory '*' \
    && git update-index --assume-unchanged


RUN mv ${DEV_REACT_CONFIG} ${PROD_REACT_CONFIG} \
  && sed -i "s#TETHYS_DEBUG_MODE.*#TETHYS_DEBUG_MODE = ${TETHYS_DEBUG_MODE}#g" ${PROD_REACT_CONFIG} \
  && sed -i "s#TETHYS_LOADER_DELAY.*#TETHYS_LOADER_DELAY = ${TETHYS_LOADER_DELAY}#g" ${PROD_REACT_CONFIG} \
  && sed -i "s#TETHYS_PORTAL_HOST.*#TETHYS_PORTAL_HOST = ${TETHYS_PORTAL_HOST}#g" ${PROD_REACT_CONFIG} \
  && sed -i "s#TETHYS_APP_ROOT_URL.*#TETHYS_APP_ROOT_URL = ${TETHYS_APP_ROOT_URL}#g" ${PROD_REACT_CONFIG}

RUN cd ${APP_SRC_ROOT} \
    && ${NPM} install \
    && ${NPM} run build \
    && rm -rf node_modules \
    && ${PDM} install --no-editable --production

ADD salt/ /srv/salt/

CMD bash run.sh

HEALTHCHECK --start-period=30s --retries=12 \
    CMD ./liveness-probe.sh