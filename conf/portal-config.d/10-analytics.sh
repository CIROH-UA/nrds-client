#!/usr/bin/env bash
set -euo pipefail

# Per-environment Google Analytics tag (staging and prod have different measurement IDs).
# The deploy pipeline supplies GOOGLE_ANALYTICS_GTAG_PROPERTY_ID from the GitHub Environment;
# without it, analytics stays unconfigured and no tag is rendered.
[ -n "${GOOGLE_ANALYTICS_GTAG_PROPERTY_ID:-}" ] || exit 0

tethys settings --set \
  ANALYTICS_CONFIG.GOOGLE_ANALYTICS_GTAG_PROPERTY_ID "${GOOGLE_ANALYTICS_GTAG_PROPERTY_ID}"

echo "Google Analytics configured: ${GOOGLE_ANALYTICS_GTAG_PROPERTY_ID}"
