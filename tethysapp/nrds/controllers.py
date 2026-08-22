import logging

from tethys_sdk.routing import controller

from .app import App

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@controller
def home(request):
    """Controller for the app home page."""
    return App.render(request, "index.html")
