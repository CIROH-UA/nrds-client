
FROM tethysplatform/tethys-core:dev-py3.12-dj5.2 

RUN apt-get update \
 && apt-get install -y --no-install-recommends --only-upgrade \
      openssl libssl3t64 openssl-provider-legacy \
 && rm -rf /var/lib/apt/lists/*


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

# Turn the compressor on. The base image enables gzip but leaves gzip_types at its default of
# text/html, so the bundle shipped uncompressed. See the file for why it goes in conf.d.
COPY deploy/nginx-gzip.conf /etc/nginx/conf.d/gzip.conf

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

ENV PDM="/root/.local/bin/pdm"
ENV APP_SRC_ROOT=${TETHYS_HOME}/apps/nrds

ENV TETHYS_APP_PACKAGE=nrds
ENV TETHYS_APP_ROOT_URL="/"

# SETUP
# The build-less vanilla client ships its frontend as committed source under
# public/frontend, packaged straight into the wheel, so this image no longer installs node or
# runs webpack. The React client (served only at ?ui=react) is not built here; build it on the
# tethys-core base if that fallback is needed.
RUN pip install --user pdm \
    && ${PDM} self update \
    && cd ${APP_SRC_ROOT} \
    && git config --global --add safe.directory '*' \
    && git update-index --assume-unchanged

RUN cd ${APP_SRC_ROOT} \
    # Dependencies first, so the generator has pyarrow. Resolving through pdm rather than a bare
    # pip install keeps the numpy<2 pin intact: this build runs inside the tethys conda env, where
    # geopandas and xarray are already built against numpy 1.x.
    && ${PDM} install --production \
    # Before the wheel is built, not after: pdm install --no-editable packages the app, and Tethys
    # serves public/ from the installed package rather than the source tree.
    && ${PDM} run python scripts/build_slim_index.py \
    && ${PDM} install --no-editable --production \
    # A missing artifact is a permanently dead search box, and the build would otherwise stay
    # green, so fail here instead of in production.
    && ${PDM} run python -c "import pathlib, sys, tethysapp.nrds as a; p = pathlib.Path(a.__file__).parent / 'public/data/hydrofabric_index_slim.parquet'; sys.exit(0) if p.is_file() and p.stat().st_size > 30_000_000 else sys.exit(f'slim index missing or too small in the installed package: {p}')" \
    # The wheel is built and asserted, so the source-tree copy and setuptools' build dir are two
    # more 45 MiB copies of a file only site-packages is read from. Measured: 142 MiB across the
    # three before this, 47 MiB after.
    && rm -rf build tethysapp/nrds/public/data

ADD salt/ /srv/salt/

CMD bash run.sh

HEALTHCHECK --start-period=30s --retries=12 \
    CMD ./liveness-probe.sh