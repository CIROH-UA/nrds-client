from tethys_sdk.routing import controller

from .app import App


@controller
def home(request):
    """Controller for the app home page. Serves the build-less vanilla client."""
    return App.render(request, "index.html")
