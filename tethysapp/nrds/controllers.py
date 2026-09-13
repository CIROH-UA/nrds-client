from tethys_sdk.routing import controller

from .app import App


@controller
def home(request):
    """Controller for the app home page.

    Serves the build-less vanilla client by default (migration cutover, U7). The React client is
    kept as a reversible fallback at ``?ui=react`` until a production soak; flipping the default
    back is this one condition.
    """
    if request.GET.get("ui") == "react":
        return App.render(request, "index.html")
    return App.render(request, "index_vanilla.html")
