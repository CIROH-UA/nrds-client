from tethys_sdk.base import TethysAppBase


class App(TethysAppBase):
    """
    Tethys app class for Next Gen in a Box Visualizer.
    """

    name = "NGIAB-NRDS"
    description = "This application helps to visualize the outputs of the model runs created by Next gen in a box and the DataStream"
    package = "nrds"  # WARNING: Do not change this value
    index = "home"
    icon = f"{package}/images/icon.png"
    catch_all = "home"  # Catch all url mapped to home controller, required for client-side routing
    root_url = "nrds"
    color = ""  # Set the theme in the frontend design tokens (public/frontend/styles/tokens.css)
    tags = ""
    enable_feedback = False
    feedback_emails = []
