# Ngen Research Datastream Visualizer

| | |
| --- | --- |
| ![CIROH Logo](https://ciroh.ua.edu/wp-content/uploads/2022/08/CIROHLogo_200x200.png) | Funding for this project was provided by the National Oceanic & Atmospheric Administration (NOAA), awarded to the Cooperative Institute for Research to Operations in Hydrology (CIROH) through the NOAA Cooperative Agreement with The University of Alabama (NA22NWS4320003). |

This app was created using an experimental Tethys + React app scaffold. It uses React for the frontend of the app and Tethys as the backend.

![Data Visualizer Interface](static/imgs/fig6-1.png)

The Data Visualizer component provides:
- **Geospatial visualization** of catchments and nexus points
- **Time series analysis** of catchments, nexus points, and troute variables
- **TEEHR output visualization** including metrics and interactive plots

Built on the Tethys Platform [(Swain et al., 2015)](https://doi.org/10.1016/j.envsoft.2015.01.014), it enables web-based exploration of model outputs [(CIROH, 2025)](https://github.com/CIROH-UA/ngiab-client).

## Usage Guide

### Assited using `ViewOnTethys` Script

Like TEEHR, the Data Visualizer can be activated upon execution of the main NGIAB guide script, `guide.sh`. A separate `viewOnTethys.sh` script is also available in the NGIAB-CloudInfra repository.

One of the advantages of the `viewOnTethys.sh` script is that it allows the user to keep multiple outputs for the same hydrofabric. It prompts the user if they want to use the same output directory by renaming it and adding it to the collection of outputs or if they want to overwrite it.

```bash
  ⚠ ~/ngiab_visualizer is not empty.
  → Keep (K) or Fresh start (F)? [K/F]: k
ℹ Reclaiming ownership of ~/ngiab_visualizer  (sudo may prompt)…
  ⚠ Directory exists: ~/ngiab_visualizer/gage-10154200
  → Overwrite (O) or Duplicate (D)? [O/D]: o
  ✓ Overwritten ➜ ~/ngiab_visualizer/gage-10154200
Checking for ~/ngiab_visualizer/ngiab_visualizer.json...
```

You should be able to see multiple outputs through the UI:

![Figure 2: NGIAB Visualizer dropdown for multiple outputs ](static/imgs/fig6-2.png){alt='A screenshot of the  NGIAB and DataStream Visualizer web interface. The map displays the ability of the visualizer to use multiple outputs'}


### Unassisted Usage


Define the env variables and running the container

```bash
# Set environment variables
export TETHYS_CONTAINER_NAME="tethys-ngen-portal"        \
       TETHYS_REPO="awiciroh/tethys-ngiab"               \
       TETHYS_TAG="latest"                               \
       NGINX_PORT=80                                     \
       MODELS_RUNS_DIRECTORY="$HOME/ngiab_visualizer"    \
       DATASTREAM_DIRECTORY="$HOME/.datastream_ngiab"    \
       VISUALIZER_CONF="$MODELS_RUNS_DIRECTORY/ngiab_visualizer.json" \
       TETHYS_PERSIST_PATH="/var/lib/tethys_persist"     \
       SKIP_DB_SETUP=false                               \
       CSRF_TRUSTED_ORIGINS="[\"http://localhost:${NGINX_PORT}\",\"http://127.0.0.1:${NGINX_PORT}\"]"
```
# Run container

```bash
docker run --rm -d \
  -p "$NGINX_PORT:$NGINX_PORT" \
  --name "$TETHYS_CONTAINER_NAME" \
  -e MEDIA_ROOT="$TETHYS_PERSIST_PATH/media" \
  -e MEDIA_URL="/media/" \
  -e SKIP_DB_SETUP="$SKIP_DB_SETUP" \
  -e NGINX_PORT="$NGINX_PORT" \
  -e CSRF_TRUSTED_ORIGINS="$CSRF_TRUSTED_ORIGINS" \
  "${TETHYS_REPO}:${TETHYS_TAG}"
```
Verify deployment:

```bash
docker ps
# CONTAINER ID   IMAGE                          PORTS                 NAMES
# b1818a03de9b   awiciroh/tethys-nrds:latest   0.0.0.0:80->80/tcp    tethys-nrds
```

Access at: http://localhost:80


###  Visualization Features 

**Nexus** points can be visualized when the user selects the output that wants to visualize. Time series can be retrieved by clicking on any of the **Nexus** points, or by changing the select dropdown assigned to the Nexus. 

![Figure 3: NGIAB Visualizer time series visualization from Nexus points](static/imgs/fig6-3.png){alt='A screenshot of the  NextGen Research DataStream Visualizer web interface. The map displays the ability of the visualizer to retrieve time series from Nexus points'}

![Figure 4: NGIAB Visualizer time series visualization from Troute variables](static/imgs/fig6-4.png){alt='A screenshot of the NGIAB and DataStream Visualizer web interface. The map displays the ability of the visualizer to retrieve time series from Troute variables'}

**Catchments** time series can be retrieved by clicking on any of the **Catchments** polygons, or by changing the select dropdown assigned to the Catchments.

![Figure 6: A map showing the geospatial visualization using the Data Visualizer within the Tethys framework for a selected outlet nexus point as well as displaying a time series plot between observed (labeled “USGS”; blue line) and simulated (labeled “ngen”; orange line)](static/imgs/fig6-6.png){alt='alt='A screenshot of the  NGIAB and DataStream Visualizer web interface. The left panel contains a "Time Series Menu" where the user can select a Nexus ID, variable (e.g., flow), and TEEHR data source. A map in the center displays a stream reach with a highlighted section representing the drainage basin and a blue point, indicating the selected nexus location. Below the map, a time series plot compares USGS (blue line) and Ngen (orange line) streamflow data from 2017 to 2023.'}


This functionality allows the user to be able to quicklu search the data they want from the [S3 bucket](https://datastream.ciroh.org/index.html) containing the output of the [NextGen DataStream](https://github.com/CIROH-UA/ngen-datastream). They can explore and download as needed.


![Figure 8: NGIAB Visualizer Visualization of DataStream Data](static/imgs/fig6-8.png){alt='A screenshot of the  NGIAB and DataStream Visualizer web interface displaying the hydrofabric for DataStream output'}

## Development Installation

You need to install both the Tethys dependencies and the node dependencies.

The webpack dev server is configured to proxy the Tethys development server (see `webpack.config.js`). The app endpoint will be handled by the webpack development server and all other endpoints will be handled by the Tethys (Django) development server. As such, you will need to start both in separate terminals.


0. First create a Virtual Environment with the tool of your choice and then run the following commands

1. Install libmamba and make it your default solver (see: A Faster Solver for Conda: Libmamba):

    ```bash
    conda update -n base conda
    conda install -n base conda-libmamba-solver
    conda config --set solver libmamba

    ```
2. Install the Tethys Platform

    Using `conda`

    ```bash
    conda install -c conda-forge tethys-platform django=<DJANGO_VESION>

    ```
    or using `pip`

    ```
    pip install tethys-platform django=<DJANGO_VERSION>

    ```

3. Create a `portal_config.yml` file :

    To add custom configurations such as the database and other local settings you will need to generate a portal_config.yml file. To generate a new template portal_config.yml run:

    ```bash
    tethys gen portal_config
    ```

    You can customize your settings in the portal_config.yml file after you generate it by manually editing the file or by using the settings command command. Refer to the Tethys Portal Configuration documentation for more information.


4. Configure the Tethys Database

    There are several options for setting up a DB server: local, docker, or remote. Tethys Platform uses a local SQLite database by default. For development environments you can use Tethys to create a local server:

    ```bash
    tethys db configure
    ```

5. Install Node Version Manager and Node.js:

    5.1 Install Node Version Manager (nvm): https://github.com/nvm-sh/nvm?tab=readme-ov-file#install--update-script

    5.2 CLOSE ALL OF YOUR TERMINALS AND OPEN NEW ONES

    5.3 Use NVM to install Node.js 20:

    ```bash
    nvm install 20
    nvm use 20
    ```

6. Install the PDM dependency manager:
    ```bash
    pip install --user pdm
    ```

    > **_NOTE:_** if you have previously installed pdm in another environment, uninstall pdm first (`pip uninstall pdm`), and then reinstall as shown above with the new environment active.



7. Clone the app and install into the Tethys environment in development mode:

    ```bash
    git clone https://github.com/CIROH-UA/ngiab-client.git
    cd ngiab-client
    pdm install
    npm install --include=dev
    cd ../
    ```

## PDM Tips

See below for more PDM tips like how to manage dependencies, install dependencies, and run scripts.

### Install only dev dependencies

* Install all dev dependencies (test & lint)

    ```bash
    pdm install -G:all
    ```

* Install only test dependencies

    ```bash
    pdm install -G test
    ```

* Install only lint and formatter dependencies

    ```bash
    pdm install -G lint
    ```

### Managing dependencies

* Add a new dependency:

1. Add the package using `pdm`:

    ```bash
    pdm add <package-name>
    ```

2. Manually add the dependency to the `install.yml`.

    > **_IMPORTANT:_** Dependencies are not automatically added to the `install.yml` yet!

* Add a new dev dependency:

    ```bash
    pdm add -dG test <package-name>
    pdm add -dG lint <package-name>
    ```

    > **_NOTE:_** Just use `pdm` to install and manage dev dependencies. The `install.yml` does not support dev dependencies, but they shouldn't be needed in it anyway, right?

* Add a new optional dependeny:

    ```bash
    pdm add -G <group-name> <package-name>
    ```

    > **_NOTE:_** You'll need to decide whether or not to add the optional dependencies to the `install.yml` b/c it does not support optional dependencies. You may consider using `pdm` to manage the optional dependencies.

* Remove a dependency:

1. Remove it from the `pyproject.yaml` and lock file:

    ```bash
    pdm remove --no-sync <package-name>
    ```

2. Manually remove it from the `install.yml`

3. If you want to remove it from the environment, use `pip` or `conda` to remove the package.

    > **_IMPORTANT:_** TL;DR: Running `pdm remove` without the `--no-sync` will remove nearly all of the dependencies in your environment. While `pdm remove` is capable of removing the package from the environment, running `pdm remove` without the `--no-sync` option can break your Tethys environment. This is because `pdm` will attempt to get the environment to match the dependencies listed in your `pyproject.toml`, which usually does not include all of the dependencies of Tethys.

### PDM Scripts

The project is configured with several PDM convenience scripts:

```bash
# Run linter
pdm run lint

# Run formatter
pdm run format

# Run tests
pdm run test

# Run all checks
pdm run all
```

## Formatting and Linting Manually

This package is configured to use yapf code formatting

1. Install lint dependencies:

    ```bash
    pdm install -G lint
    ```

2. Run code formatting from the project directory:

    ```bash
    yapf --in-place --recursive --verbose .

    # Short version
    yapf -ir -vv .
    ```

3. Run linter from the project directory:

    ```bash
    flake8 .
    ```

    > **_NOTE:_** The configuration for yapf and flake8 is in the `pyproject.toml`.

## Testing Manually

This package is configured to use pytest for testing

1. Install test dependencies:

    ```bash
    pdm install -G test
    ```

2. Run tests from the project directory:

    ```bash
    pytest
    ```

    > **_NOTE:_** The configuration for pytest and coverage is in the `pyproject.toml`.


## Build Node Modules

Webpack is configured to bundle and build the React app into the `tethysapp/<app_package>/public/frontend` directory. Before building a Python distribution for release, you should build using this command:

```
npm run build
```

## Test Node Modules

Use the following commands to lint and test the React portion of the app.

```
npm run lint
npm run test
```

The linting capability is powered by [eslint](https://eslint.org/) and a number of plugins for React. The testing capabilities include [jest](https://jestjs.io/), [jsdom](https://github.com/jsdom/jsdom#readme), [testing-framework](https://testing-library.com/), [user-event](https://testing-library.com/docs/user-event/intro/), and a few other JavaScript testing utilties to make it easy to test the frontend of the React-Tethys app.

## Acknowledgements

The React + Django implementation is based on the excellent work done by @Jitensid that can be found on GitHub here: [Jitensid/django-webpack-dev-server](https://github.com/Jitensid/django-webpack-dev-server).

## Contribute
Please feel free to contribute!