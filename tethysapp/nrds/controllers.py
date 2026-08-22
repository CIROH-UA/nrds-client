import os
import geopandas as gpd
from tethys_sdk.routing import controller

from .app import App
import logging

# the following error is fixed with this lines
# https://stackoverflow.com/a/79163867
import pyproj

pyproj.network.set_network_enabled(False)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

@controller
def home(request):
    """Controller for the app home page."""
    return App.render(request, "index.html")
