from tethys_sdk.routing import controller

from .app import App


@controller
def home(request):
    """Controller for the app home page.

    Serves the React app by default. During the vanilla-JS migration the build-less client is
    reachable at ``?ui=vanilla`` so it can be exercised without displacing React; the cutover
    (U7) makes the vanilla template the default.
    """
    if request.GET.get("ui") == "vanilla":
        return App.render(request, "index_vanilla.html")
    return App.render(request, "index.html")
