#!/bin/bash

# ======================================================================
# CIROH: NRDS Visualization
# ======================================================================

# Enable debug mode to see what's happening
# set -x

# Color definitions with enhanced palette
BBlack='\033[1;30m'
BRed='\033[1;31m'
BGreen='\033[1;32m'
BYellow='\033[1;33m'
BBlue='\033[1;34m'
BPurple='\033[1;35m'
BCyan='\033[1;36m'
BWhite='\033[1;37m'
UBlack='\033[4;30m'
URed='\033[4;31m'
UGreen='\033[4;32m'
UYellow='\033[4;33m'
UBlue='\033[4;34m'
UPurple='\033[4;35m'
UCyan='\033[4;36m'
UWhite='\033[4;37m'
Color_Off='\033[0m'

# Extended color palette with 256-color support
LBLUE='\033[38;5;39m'  # Light blue
LGREEN='\033[38;5;83m' # Light green 
LPURPLE='\033[38;5;171m' # Light purple
LORANGE='\033[38;5;215m' # Light orange
LTEAL='\033[38;5;87m'  # Light teal

# Background colors for highlighting important messages
BG_Green='\033[42m'
BG_Blue='\033[44m'
BG_Red='\033[41m'
BG_LBLUE='\033[48;5;117m' # Light blue background

# Symbols for better UI
CHECK_MARK="${BGreen}✓${Color_Off}"
CROSS_MARK="${BRed}✗${Color_Off}"
ARROW="${LORANGE}→${Color_Off}"
INFO_MARK="${LBLUE}ℹ${Color_Off}"
WARNING_MARK="${BYellow}⚠${Color_Off}"

# Fix for missing environment variables that might cause display issues
export TERM=xterm-256color

# Constants
TETHYS_CONTAINER_NAME="tethys-nrds"
TETHYS_REPO="awiciroh/tethys-nrds"
TETHYS_TAG="latest"
SKIP_DB_SETUP=false

# Disable error trapping initially so we can catch and report errors
set +e

# Function for animated loading with gradient colors
show_loading() {
    local message=$1
    local duration=${2:-3}
    local chars="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
    local colors=("\033[38;5;39m" "\033[38;5;45m" "\033[38;5;51m" "\033[38;5;87m")
    local end_time=$((SECONDS + duration))
    
    while [ $SECONDS -lt $end_time ]; do
        for (( i=0; i<${#chars}; i++ )); do
            color_index=$((i % ${#colors[@]}))
            echo -ne "\r${colors[$color_index]}${chars:$i:1}${Color_Off} $message"
            sleep 0.1
        done
    done
    echo -ne "\r${CHECK_MARK} $message - Complete!   \n"
}

# Function for section headers
print_section_header() {
    local title=$1
    local width=70
    local padding=$(( (width - ${#title}) / 2 ))
    
    # Create a more visually appealing section header with light blue background
    echo -e "\n\033[48;5;117m$(printf "%${width}s" " ")\033[0m"
    echo -e "\033[48;5;117m$(printf "%${padding}s" " ")${BBlack}${title}$(printf "%${padding}s" " ")\033[0m"
    echo -e "\033[48;5;117m$(printf "%${width}s" " ")\033[0m\n"
}

# Simple banner without complex formatting
print_welcome_banner() {
    clear
    echo -e "\n"
    echo -e "${BBlue}=================================================${Color_Off}"
    echo -e "${BBlue}|  CIROH: NextGen In A Box (NGIAB) - Tethys     |${Color_Off}"
    echo -e "${BBlue}|  Interactive Model Output Visualization       |${Color_Off}"
    echo -e "${BBlue}=================================================${Color_Off}"
    echo -e "\n${INFO_MARK} ${BWhite}Developed by CIROH${Color_Off}\n"
    sleep 1
}

# Function for error handling
handle_error() {
    echo -e "\n${BG_Red}${BWhite} ERROR: $1 ${Color_Off}"
    # Save error to log file
    echo "$(date): ERROR: $1" >> ~/ngiab_tethys_error.log
    
    # Be sure to clean up resources even on error
    tear_down
    exit 1
}

# Function to handle the SIGINT (Ctrl-C)
handle_sigint() {
    echo -e "\n${BG_Red}${BWhite} Operation cancelled by user. Cleaning up... ${Color_Off}"
    tear_down
    exit 1
}

# Set up trap for signal handlers
trap handle_sigint INT TERM
trap 'handle_error "Unexpected error occurred at line $LINENO: $BASH_COMMAND"' ERR

# Detect platform
if uname -a | grep -q 'arm64\|aarch64'; then
    PLATFORM="linux/arm64"
else
    PLATFORM="linux/amd64"
fi


set_tethys_tag() {
    echo -e "${Color_Off}${BBlue}Specify the Tethys image tag to use: ${Color_Off}"
    read -erp "$(echo -e "  ${ARROW} Tag (e.g. v0.2.1, default: latest): ")" TETHYS_TAG
    if [[ -z "$TETHYS_TAG" ]]; then
        TETHYS_TAG="latest"
    fi
}

check_for_existing_tethys_image() {
    # First check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        echo -e "${BRed}Docker daemon is not running or accessible.${Color_Off}"
        return 1
    fi
    
    # Check if the image exists locally
    local image_exists=false
    if docker image inspect "${TETHYS_REPO}:${TETHYS_TAG}" >/dev/null 2>&1; then
        image_exists=true
    fi
    
    if [ "$image_exists" = true ]; then
        echo -e "  ${CHECK_MARK} ${BGreen}Using local Tethys image: ${TETHYS_REPO}:${TETHYS_TAG}${Color_Off}"
        return 0
    else
        echo -e "  ${INFO_MARK} ${BYellow}Tethys image not found locally. Pulling from registry...${Color_Off}"
        show_loading "Downloading Tethys image" 3
        if ! docker pull "${TETHYS_REPO}:${TETHYS_TAG}"; then
            echo -e "  ${CROSS_MARK} ${BRed}Failed to pull Docker image: ${TETHYS_REPO}:${TETHYS_TAG}${Color_Off}"
            return 1
        fi
        echo -e "  ${CHECK_MARK} ${BGreen}Tethys image downloaded successfully${Color_Off}"
        return 0
    fi
}

choose_port_to_run_tethys() {
    while true; do
        echo -e "${BBlue}Select a port to run Tethys on. [Default: 80] ${Color_Off}"
        read -erp "$(echo -e "  ${ARROW} Port: ")" nginx_tethys_port

        # Default to 80 if the user just hits <Enter>
        if [[ -z "$nginx_tethys_port" ]]; then
            nginx_tethys_port=80
            echo -e "${ARROW} ${BWhite}Using default port 80 for Tethys.${Color_Off}"
        fi

        # Validate numeric port 1-65535
        if ! [[ "$nginx_tethys_port" =~ ^[0-9]+$ ]] || \
           [ "$nginx_tethys_port" -lt 1 ] || [ "$nginx_tethys_port" -gt 65535 ]; then
            echo -e "${BRed}Invalid port number. Please enter 1-65535.${Color_Off}"
            continue
        fi

        # Check if the port is already in use (skip check if lsof not present)
        if command -v lsof >/dev/null && lsof -i:"$nginx_tethys_port" >/dev/null 2>&1; then
            echo -e "${BRed}Port $nginx_tethys_port is already in use. Choose another.${Color_Off}"
            continue
        fi

        break
    done

    CSRF_TRUSTED_ORIGINS="[\"http://localhost:${nginx_tethys_port}\",\"http://127.0.0.1:${nginx_tethys_port}\"]"
    echo -e "  ${CHECK_MARK} ${BGreen}Port $nginx_tethys_port selected${Color_Off}"

    return 0
}

# Wait for a Docker container to become healthy
wait_container_healthy() {
    local container_name=$1
    local container_health_status=""
    local attempt_counter=0

    echo -e "${INFO_MARK} ${BWhite} Waiting for container: $container_name to become healthy. This can take a couple of minutes...${Color_Off}"
    while true; do
        # Update the health status
        container_health_status=$(docker inspect -f '{{.State.Health.Status}}' "$container_name" 2>/dev/null)

        if [ $? -ne 0 ]; then
            echo -e "\n ${WARNING_MARK} ${BG_Red}${BWhite} Failed to get health status for container $container_name. Ensure the container exists and has a health check. ${Color_Off}"
            return 1
        fi

        if [[ "$container_health_status" == "healthy" ]]; then
            echo -e "\n ${CHECK_MARK} ${BG_Green}${BWhite} Container $container_name is now healthy! ${Color_Off}"
            return 0
        elif [[ "$container_health_status" == "unhealthy" ]]; then
            echo -e "\n ${WARNING_MARK} ${BG_Red}${BWhite} Container $container_name is unhealthy! ${Color_Off}"
            return 0
        elif [[ -z "$container_health_status" ]]; then
            echo -e "\n ${WARNING_MARK} ${BG_Red}${BWhite} No health status available for container $container_name. Ensure the container has a health check configured. ${Color_Off}"
            return 1
        fi

        ((attempt_counter++))
        sleep 2  # Adjust the sleep time as needed
    done
}

run_tethys() {

    echo -e "${ARROW} ${BWhite}Launching Tethys container...${Color_Off}"

    # First, make sure any existing Tethys containers are stopped
    if docker ps -q -f name="$TETHYS_CONTAINER_NAME" >/dev/null 2>&1; then
        echo -e "  ${INFO_MARK} ${BYellow}Tethys container is already running. Stopping it first...${Color_Off}"
        docker stop "$TETHYS_CONTAINER_NAME" >/dev/null 2>&1
        sleep 3
    fi

    # Final check - if container still exists, force removal
    if docker ps -a -q -f name="$TETHYS_CONTAINER_NAME" >/dev/null 2>&1; then
        echo -e "  ${WARNING_MARK} ${BYellow}Forcibly removing container...${Color_Off}"
        docker rm -f "$TETHYS_CONTAINER_NAME" >/dev/null 2>&1 || true
        sleep 2
    fi

    # Brief delay before starting
    sleep 1
    echo -e "  ${INFO_MARK} ${BYellow}Starting Tethys container...${Color_Off}"

    # Launch container with explicit error handling
    echo -e "  ${INFO_MARK} Running docker command..."
    docker run --rm -d \
        -p "$nginx_tethys_port:$nginx_tethys_port" \
        --name "$TETHYS_CONTAINER_NAME" \
        --env SKIP_DB_SETUP="$SKIP_DB_SETUP" \
        --env NGINX_PORT="$nginx_tethys_port" \
        --env CSRF_TRUSTED_ORIGINS="$CSRF_TRUSTED_ORIGINS" \
        "${TETHYS_REPO}:${TETHYS_TAG}"
    if [ $? -eq 0 ]; then
        echo -e "  ${CHECK_MARK} ${BGreen}Tethys container started successfully.${Color_Off}"
        return 0
    else
        echo -e "  ${CROSS_MARK} ${BRed}Failed to start Tethys container.${Color_Off}"
        return 1
    fi
}

# ──────────────────────────────────────────────────────────────────────
# Decide whether to use the local Tethys image or pull an update
# ──────────────────────────────────────────────────────────────────────
select_tethys_image_source() {
    # Bail out early if Docker is unavailable
    if ! docker info >/dev/null 2>&1; then
        echo -e "  ${CROSS_MARK} ${BRed}Docker daemon not running.${Color_Off}"
        return 1
    fi

    local image_ref="${TETHYS_REPO}:${TETHYS_TAG}"

    # Does the image already exist locally?
    if docker image inspect "$image_ref" >/dev/null 2>&1; then
        echo -e "  ${INFO_MARK} Found local image ${BCyan}$image_ref${Color_Off}"
        while true; do
            echo -ne "  ${ARROW} Use local copy (L) or Pull latest from registry (P)? [L/P]: "
            read -r decision < /dev/tty
            case "$decision" in
                [Ll]* )
                    echo -e "  ${CHECK_MARK} Using local image" ; return 0 ;;
                [Pp]* )
                    echo -e "  ${INFO_MARK} ${BYellow}Pulling image – this may take a moment…${Color_Off}"
                    show_loading "Downloading Tethys image" 3
                    docker pull "$image_ref" && return 0
                    echo -e "  ${CROSS_MARK} ${BRed}Failed to pull $image_ref${Color_Off}"
                    return 1 ;;
                * )
                    echo -e "  ${CROSS_MARK} ${BRed}Invalid choice. Enter 'L' or 'P'.${Color_Off}" ;;
            esac
        done
    else
        # No local image – pull automatically
        echo -e "  ${INFO_MARK} ${BYellow}Image not found locally – pulling $image_ref…${Color_Off}"
        show_loading "Downloading Tethys image" 3
        docker pull "$image_ref" && return 0
        echo -e "  ${CROSS_MARK} ${BRed}Failed to pull $image_ref${Color_Off}"
        return 1
    fi
}

tear_down() {
    echo -e "\n${ARROW} ${BYellow}Cleaning up resources...${Color_Off}"
    
    # Check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        echo -e "  ${CROSS_MARK} ${BRed}Docker daemon is not running, cannot clean up containers.${Color_Off}"
        return 1
    fi
    
    # Stop the Tethys container if it's running
    if docker ps -q -f name="$TETHYS_CONTAINER_NAME" >/dev/null 2>&1; then
        echo -e "  ${INFO_MARK} Stopping Tethys container..."
        docker stop "$TETHYS_CONTAINER_NAME" >/dev/null 2>&1
        sleep 2
    fi
    
    echo -e "  ${CHECK_MARK} ${BGreen}Cleanup completed${Color_Off}"
    return 0
}

pause_script_execution() {
    echo -e "\n${BG_Blue}${BWhite} Tethys is now running ${Color_Off}"
    echo -e "${INFO_MARK} Access the visualization at: ${UBlue}http://localhost:$nginx_tethys_port${Color_Off}"
    echo -e "${INFO_MARK} Press ${BWhite}Ctrl+C${Color_Off} to stop Tethys when you're done."
    
    # Keep script running until user interrupts
    while true; do
        sleep 10
    done
}

# Main script execution
print_welcome_banner

print_section_header "LAUNCHING TETHYS VISUALIZATION"

# Select Tethys image
set_tethys_tag

select_tethys_image_source || {
    echo -e "${CROSS_MARK} ${BRed}Unable to obtain Tethys image. Exiting.${Color_Off}"
    exit 1
}

choose_port_to_run_tethys
run_tethys || {
    echo -e "${CROSS_MARK} ${BRed}Failed to start Tethys container. Exiting.${Color_Off}"
    exit 1
}

# Wait for container to be ready
wait_container_healthy "$TETHYS_CONTAINER_NAME" || {
    echo -e "${CROSS_MARK} ${BRed}Tethys container failed to start properly. Exiting.${Color_Off}"
    exit 1
}

print_section_header "VISUALIZATION READY"

echo -e "${BG_Green}${BWhite} Your model outputs are now available for visualization! ${Color_Off}\n"
echo -e "${INFO_MARK} Access the visualization at: ${UBlue}http://localhost:$nginx_tethys_port/apps/ngiab${Color_Off}"
echo -e "${INFO_MARK} Login credentials:"
echo -e "  ${ARROW} ${BWhite}Username:${Color_Off} admin"
echo -e "  ${ARROW} ${BWhite}Password:${Color_Off} pass"
echo -e "\n${INFO_MARK} Source code: ${UBlue}https://github.com/CIROH-UA/ngiab-client${Color_Off}"

# Keep the script running
pause_script_execution

exit 0
