#!/usr/bin/env bash
set -euo pipefail

# Wrapper around the base image's provision.sh that can bootstrap an EMPTY database.
#
# Why this exists: Tethys builds its URLconf from rows in `tethys_apps_tethysapp`, and Django
# runs system checks (which load the URLconf) before `migrate` executes. On a brand-new DB that
# table doesn't exist yet, so plain `tethys db migrate` -- and therefore provision.sh -- dies with
# "no such table: tethys_apps_tethysapp". The old conda image never hit this because its sqlite DB
# was migrated at image-build time. We break the cycle with one checks-free migration, after which
# provision.sh runs normally (migrate is idempotent).
#
# Upstream candidate: tethys-uvx's provision.sh arguably should do this itself.

/usr/local/bin/portal-config.sh

MANAGE="$(python -c 'import os, tethys_portal; print(os.path.join(os.path.dirname(tethys_portal.__file__), "manage.py"))')"

if ! python "$MANAGE" migrate --check --skip-checks >/dev/null 2>&1; then
  echo "Bootstrapping database (migrate --skip-checks)"
  python "$MANAGE" migrate --skip-checks
fi

exec /usr/local/bin/provision.sh
