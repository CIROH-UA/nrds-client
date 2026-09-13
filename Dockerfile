ARG TETHYS_UVX_TAG=a3148d5

# ---------------------------------------------------------------------------
# Build: install the app, generate the search index, migrate the DB, collect static
# ---------------------------------------------------------------------------
FROM ghcr.io/aquaveo/tethys-uvx:builder-${TETHYS_UVX_TAG} AS builder

WORKDIR /build
COPY . /build

RUN git config --global --add safe.directory '*' \
    && uv pip install --python "${VIRTUAL_ENV}" /build

# The build-less vanilla client reads the 45 MiB search index straight from /static; the browser
# never downloads the 103 MB source. Generated into the installed package after the app is on the
# path so collectstatic picks it up, and asserted so a truncated write cannot ship a dead search
# box. pyarrow and the numpy<2 pin come in with the app; no server-side duckdb is needed because
# the client runs duckdb-wasm in the browser.
RUN PKG="$("${VIRTUAL_ENV}/bin/python" -c 'import pathlib, tethysapp.nrds as a; print(pathlib.Path(a.__file__).parent)')" \
    && "${VIRTUAL_ENV}/bin/python" /build/scripts/build_slim_index.py \
        --out "${PKG}/public/data/hydrofabric_index_slim.parquet" \
    && "${VIRTUAL_ENV}/bin/python" -c "import pathlib, sys; p = pathlib.Path('${PKG}/public/data/hydrofabric_index_slim.parquet'); sys.exit(0) if p.is_file() and p.stat().st_size > 30_000_000 else sys.exit(f'slim index missing or too small: {p}')"

ENV TETHYS_DB_ENGINE=django.db.backends.sqlite3
ENV TETHYS_DB_NAME=/home/tethys/nrds/tethys_platform.sqlite
ENV STATIC_ROOT=/home/tethys/nrds/static
ENV PORTAL_SUPERUSER_NAME=admin
ENV PORTAL_SUPERUSER_PASSWORD=pass

COPY conf/portal_config.yml ${TETHYS_HOME}/portal_config.yml

# Standalone routing has to be off while the management commands run, then back on for the baked
# image; db migrate and createsuperuser misbehave under STANDALONE_APP. collectstatic bakes the
# app's public/ (frontend and the slim index) into STATIC_ROOT, which static_urls serves.
RUN mkdir -p /home/tethys/nrds/static \
    && sed -i -E 's/^([[:space:]]*)(MULTIPLE_APP_MODE|STANDALONE_APP):/\1# BUILD-DISABLED \2:/' \
        "${TETHYS_HOME}/portal_config.yml" \
    && "${VIRTUAL_ENV}/bin/tethys" db migrate \
    && "${VIRTUAL_ENV}/bin/tethys" db createsuperuser \
        --pn "${PORTAL_SUPERUSER_NAME}" \
        --pp "${PORTAL_SUPERUSER_PASSWORD}" \
        --pe "" \
    && sed -i -E 's/^([[:space:]]*)# BUILD-DISABLED (MULTIPLE_APP_MODE|STANDALONE_APP):/\1\2:/' \
        "${TETHYS_HOME}/portal_config.yml" \
    && grep -q '^[[:space:]]*MULTIPLE_APP_MODE:' "${TETHYS_HOME}/portal_config.yml" \
    && "${VIRTUAL_ENV}/bin/tethys" site -f \
    && "${VIRTUAL_ENV}/bin/tethys" manage collectstatic --noinput \
    # collectstatic has copied the 45 MiB slim index into STATIC_ROOT, which is what static_urls
    # serves; the installed-package copy is read only at collect time, so drop it rather than ship
    # it twice in the runtime image. Resolve the path from / so the WORKDIR /build source tree does
    # not shadow the installed location on sys.path.
    && rm -rf "$(cd / && "${VIRTUAL_ENV}/bin/python" -c 'import pathlib, tethysapp.nrds as a; print(pathlib.Path(a.__file__).parent)')/public/data" \
    && chown -R 1000:1000 /home/tethys/nrds \
    && test -s /home/tethys/nrds/tethys_platform.sqlite \
    && echo "baked db: $(stat -c%s /home/tethys/nrds/tethys_platform.sqlite) bytes" \
    && echo "baked static: $(find /home/tethys/nrds/static -type f | wc -l) files"

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM ghcr.io/aquaveo/tethys-uvx:runtime-base-${TETHYS_UVX_TAG}

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends --only-upgrade \
        libexpat1 \
        libpq5 \
        openssl \
        libssl3t64 \
        openssl-provider-legacy \
    && rm -rf /var/lib/apt/lists/*
USER 1000

COPY --from=builder /opt/python /opt/python
COPY --from=builder /opt/conda /opt/conda
COPY --from=builder --chown=1000:1000 /home/tethys/nrds /home/tethys/nrds

COPY --chown=1000:1000 conf/portal_config.yml /config/portal_config.yml

ENV TETHYS_DB_ENGINE=django.db.backends.sqlite3
ENV TETHYS_PERSIST=/home/tethys/persist
ENV TETHYS_DB_NAME=/home/tethys/nrds/tethys_platform.sqlite
ENV STATIC_ROOT=/home/tethys/nrds/static

ENV PORT=8080
ENV TETHYS_PORT=8080

ENV TETHYS_SECRET_KEY=nrds-local-default-override-in-any-shared-deployment
ENV GUNICORN_TIMEOUT=600
ENV GUNICORN_GRACEFUL_TIMEOUT=60

CMD ["/usr/local/bin/serve.sh"]
