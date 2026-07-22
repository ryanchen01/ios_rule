#!/bin/bash

# Snell Server Installation/Update Script
# Based on tutorial from surge.tel

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

ensure_snell_config() {
    local config_dir config_file

    config_dir="/etc/snell"
    config_file="$config_dir/snell-server.conf"
    CONFIG_GENERATED=false

    if [ -f "$config_file" ]; then
        print_status "Existing Snell configuration found; preserving it"
        return 0
    fi

    print_status "No Snell configuration found; generating one automatically..."
    mkdir -p "$config_dir"
    printf 'y\n' | /usr/local/bin/snell-server --wizard -c "$config_file"

    if [ ! -s "$config_file" ]; then
        print_error "Snell configuration generation failed."
        exit 1
    fi

    CONFIG_GENERATED=true
    print_success "Generated $config_file with a random port and PSK"
}

display_management_commands() {
    echo "=========================================="
    echo "USEFUL COMMANDS"
    echo "=========================================="
    echo "Check status:    systemctl status snell"
    echo "View logs:       journalctl -u snell -f"
    echo "Stop service:    systemctl stop snell"
    echo "Start service:   systemctl start snell"
    echo "Restart service: systemctl restart snell"
    echo "View config:     cat /etc/snell/snell-server.conf"
    echo "Update server:   Run this script again"
    echo ""
}

display_surge_config() {
    local config_file server_psk server_port listen_value
    local server_address protocol_version node_name

    config_file="/etc/snell/snell-server.conf"
    if [ ! -r "$config_file" ]; then
        print_warning "Could not read $config_file to generate the Surge config."
        return 0
    fi

    server_psk=$(awk '/^[[:space:]]*psk[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }' "$config_file")
    server_port=$(awk -F= '/^[[:space:]]*port[[:space:]]*=/ { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$config_file")

    # Newer configs use "listen = address:port" instead of a separate port.
    if [ -z "$server_port" ]; then
        listen_value=$(awk '/^[[:space:]]*listen[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }' "$config_file")
        server_port=$(printf '%s' "$listen_value" | grep -oE ':[0-9]{1,5}' | head -n 1 | tr -d ':' || true)
    fi

    server_address=$(curl -4fsS --connect-timeout 5 --max-time 10 https://api.ipify.org || true)
    if [ -z "$server_address" ] && command -v hostname > /dev/null 2>&1; then
        server_address=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    fi
    server_address=${server_address:-YOUR_SERVER_IP}

    protocol_version=$(printf '%s' "$LATEST_VER" | sed -E 's/^v([0-9]+).*/\1/')
    node_name="Snell-$LATEST_VER"

    echo ""
    echo "=========================================="
    echo "SURGE CONFIG"
    echo "=========================================="
    if [ -n "$server_psk" ] && [ -n "$server_port" ]; then
        echo "[Proxy]"
        echo "$node_name = snell, $server_address, $server_port, psk=$server_psk, version=$protocol_version"
    else
        print_warning "Could not read the PSK or port from $config_file."
    fi
    echo ""
}

usage() {
    cat <<EOF
Usage: $0 [--release | --rc | --beta]

  --release  Install the latest stable Snell release
  --rc       Install the latest Snell release candidate
  --beta     Install the latest Snell v6 beta
  -h, --help Show this help message
EOF
}

CHANNEL=""
case "${1:-}" in
    --release)
        CHANNEL="release"
        ;;
    --rc)
        CHANNEL="rc"
        ;;
    --beta)
        CHANNEL="beta"
        ;;
    -h|--help)
        usage
        exit 0
        ;;
    "")
        ;;
    *)
        print_error "Unknown option: $1"
        usage
        exit 1
        ;;
esac

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root (use sudo -i)"
   exit 1
fi

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH_SUFFIX="linux-amd64"
        ;;
    aarch64|arm64)
        ARCH_SUFFIX="linux-aarch64"
        ;;
    *)
        print_error "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

print_status "Detected architecture: $ARCH ($ARCH_SUFFIX)"

# Install the commands required by both fresh installs and updates.
MISSING_DEPENDENCIES=false
for command_name in curl wget unzip; do
    if ! command -v "$command_name" > /dev/null 2>&1; then
        MISSING_DEPENDENCIES=true
        break
    fi
done

if [ "$MISSING_DEPENDENCIES" = true ]; then
    print_status "Installing dependencies..."
    if command -v apt > /dev/null 2>&1; then
        apt update && apt install -y curl wget unzip
    elif command -v dnf > /dev/null 2>&1; then
        dnf install -y curl wget unzip
    elif command -v yum > /dev/null 2>&1; then
        yum install -y curl wget unzip
    else
        print_error "Package manager not found. Please install curl, wget, and unzip manually."
        exit 1
    fi
fi

# Check if Snell server already exists
EXISTING_INSTALL=false
if [ -f "/usr/local/bin/snell-server" ]; then
    EXISTING_INSTALL=true
    print_status "Existing Snell server installation detected"
    
    # Get current version
    CURRENT_VERSION=$(
        /usr/local/bin/snell-server --version 2>&1 |
        grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+(b[0-9]+|rc[0-9]*)?' |
        head -n 1
    )
    CURRENT_VERSION=${CURRENT_VERSION:-unknown}
    print_status "Current version: $CURRENT_VERSION"
else
    print_status "No existing installation found, performing fresh installation"
fi

# Scan all sources once, before asking the user to choose a channel. This keeps
# unavailable channels out of the menu and lets the selected result be reused.
discover_available_downloads() {
    local source_url page matches all_downloads

    all_downloads=""
    for source_url in \
        "https://kb.nssurge.com/surge-knowledge-base/release-notes/snell" \
        "https://kb.nssurge.com/surge-knowledge-base/zh/release-notes/snell" \
        "https://dl.nssurge.com/snell/"; do
        if page=$(curl -fsSL --connect-timeout 10 --max-time 30 "$source_url"); then
            matches=$(printf '%s' "$page" |
                grep -oE "snell-server-v[0-9]+\.[0-9]+\.[0-9]+(b[0-9]+|rc[0-9]*)?-${ARCH_SUFFIX}\.zip" || true)
            if [ -n "$matches" ]; then
                all_downloads="${all_downloads}${all_downloads:+$'\n'}${matches}"
            fi
        fi
    done

    AVAILABLE_RELEASE=$(printf '%s\n' "$all_downloads" |
        grep -E "^snell-server-v[0-9]+\.[0-9]+\.[0-9]+-${ARCH_SUFFIX}\.zip$" |
        sort -Vu | tail -n 1 || true)
    AVAILABLE_RC=$(printf '%s\n' "$all_downloads" |
        grep -E "^snell-server-v6\.[0-9]+\.[0-9]+rc[0-9]*-${ARCH_SUFFIX}\.zip$" |
        sort -Vu | tail -n 1 || true)
    AVAILABLE_BETA=$(printf '%s\n' "$all_downloads" |
        grep -E "^snell-server-v6\.[0-9]+\.[0-9]+b[0-9]+-${ARCH_SUFFIX}\.zip$" |
        sort -Vu | tail -n 1 || true)

    [ -n "$AVAILABLE_RELEASE" ] || [ -n "$AVAILABLE_RC" ] || [ -n "$AVAILABLE_BETA" ]
}

channel_download() {
    case "$1" in
        release) printf '%s\n' "$AVAILABLE_RELEASE" ;;
        rc)      printf '%s\n' "$AVAILABLE_RC" ;;
        beta)    printf '%s\n' "$AVAILABLE_BETA" ;;
    esac
}

channel_label() {
    case "$1" in
        release) printf '%s\n' "release" ;;
        rc)      printf '%s\n' "release candidate" ;;
        beta)    printf '%s\n' "beta" ;;
    esac
}

print_status "Scanning for available Snell versions..."
if ! discover_available_downloads; then
    print_error "Could not find any Snell downloads for $ARCH_SUFFIX."
    exit 1
fi

AVAILABLE_CHANNELS=()
AVAILABLE_FILES=()
for candidate_channel in release rc beta; do
    candidate_file=$(channel_download "$candidate_channel")
    if [ -n "$candidate_file" ]; then
        AVAILABLE_CHANNELS+=("$candidate_channel")
        AVAILABLE_FILES+=("$candidate_file")
    fi
done

# Keep an installed prerelease channel as the default. Otherwise prefer stable.
DEFAULT_CHANNEL="release"
if [[ "$CURRENT_VERSION" =~ rc[0-9]*$ ]]; then
    DEFAULT_CHANNEL="rc"
elif [[ "$CURRENT_VERSION" =~ b[0-9]+$ ]]; then
    DEFAULT_CHANNEL="beta"
fi

DEFAULT_CHOICE=""
for index in "${!AVAILABLE_CHANNELS[@]}"; do
    if [ "${AVAILABLE_CHANNELS[$index]}" = "$DEFAULT_CHANNEL" ]; then
        DEFAULT_CHOICE=$((index + 1))
        break
    fi
done

if [ -z "$CHANNEL" ]; then
    if [ -t 0 ]; then
        echo ""
        echo "Select the Snell version channel:"
        for index in "${!AVAILABLE_CHANNELS[@]}"; do
            available_version=$(printf '%s' "${AVAILABLE_FILES[$index]}" |
                grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+(b[0-9]+|rc[0-9]*)?')
            printf '  %d) Latest %s (%s)\n' \
                "$((index + 1))" "$(channel_label "${AVAILABLE_CHANNELS[$index]}")" "$available_version"
        done

        # If the preferred channel was not discovered, default to the first
        # available option for an interactive selection only.
        DEFAULT_CHOICE=${DEFAULT_CHOICE:-1}
        DEFAULT_LABEL=$(channel_label "${AVAILABLE_CHANNELS[$((DEFAULT_CHOICE - 1))]}")
        while true; do
            read -r -p "Choice [${DEFAULT_CHOICE} - ${DEFAULT_LABEL}]: " CHANNEL_CHOICE
            CHANNEL_CHOICE=${CHANNEL_CHOICE:-$DEFAULT_CHOICE}
            if [[ "$CHANNEL_CHOICE" =~ ^[0-9]+$ ]] &&
                [ "$CHANNEL_CHOICE" -ge 1 ] &&
                [ "$CHANNEL_CHOICE" -le "${#AVAILABLE_CHANNELS[@]}" ]; then
                CHANNEL="${AVAILABLE_CHANNELS[$((CHANNEL_CHOICE - 1))]}"
                break
            fi
            print_warning "Please enter a number from 1 to ${#AVAILABLE_CHANNELS[@]}."
        done
    elif [ -n "$DEFAULT_CHOICE" ]; then
        CHANNEL="$DEFAULT_CHANNEL"
        print_status "No interactive terminal detected; using the $CHANNEL channel"
    else
        print_error "The default $DEFAULT_CHANNEL channel is unavailable. Specify --release, --rc, or --beta."
        exit 1
    fi
fi

DOWNLOAD_FILE=$(channel_download "$CHANNEL")
if [ -z "$DOWNLOAD_FILE" ]; then
    print_error "No Snell $CHANNEL download is currently available for $ARCH_SUFFIX."
    exit 1
fi

LATEST_VER=$(printf '%s' "$DOWNLOAD_FILE" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+(b[0-9]+|rc[0-9]*)?')
print_success "Latest $CHANNEL version found: $LATEST_VER"

# Check if update is needed
if [ "$EXISTING_INSTALL" = true ]; then
    if [ "$CURRENT_VERSION" = "$LATEST_VER" ]; then
        print_success "Snell server is already up to date ($CURRENT_VERSION)"
        ensure_snell_config
        if [ "$CONFIG_GENERATED" = true ]; then
            print_status "Restarting Snell with the generated configuration..."
            systemctl restart snell
        fi
        print_status "Service status:"
        systemctl status snell --no-pager -l || true
        display_surge_config
        exit 0
    else
        print_status "Update available: $CURRENT_VERSION -> $LATEST_VER"
    fi
fi

# Download Snell Server
print_status "Downloading Snell Server..."
wget -O "/tmp/$DOWNLOAD_FILE" "https://dl.nssurge.com/snell/$DOWNLOAD_FILE"

if [ "$EXISTING_INSTALL" = true ]; then
    # Update existing installation
    print_status "Stopping Snell service..."
    systemctl stop snell
    
    print_status "Backing up current executable..."
    BACKUP_FILE="/usr/local/bin/snell-server.backup.$(date +%Y%m%d_%H%M%S)"
    cp /usr/local/bin/snell-server "$BACKUP_FILE"
    
    print_status "Replacing Snell Server executable..."
    unzip -o "/tmp/$DOWNLOAD_FILE" -d /usr/local/bin
    chmod +x /usr/local/bin/snell-server

    ensure_snell_config
    
    print_status "Starting Snell service..."
    systemctl start snell
    
    # Wait a moment for service to start
    sleep 2
    
    # Check service status
    if systemctl is-active --quiet snell; then
        print_success "Snell server updated successfully to $LATEST_VER!"
        print_status "Service is running"
        
        # Show current config for reference
        print_status "Current configuration:"
        echo "----------------------------------------"
        cat /etc/snell/snell-server.conf
        echo "----------------------------------------"
    else
        print_error "Service failed to start after update. Checking logs..."
        journalctl -u snell --no-pager -l
        
        print_warning "Attempting to restore backup..."
        systemctl stop snell
        cp "$BACKUP_FILE" /usr/local/bin/snell-server
        systemctl start snell
        exit 1
    fi
    
else
    # Fresh installation
    print_status "Extracting Snell Server to /usr/local/bin..."
    unzip -o "/tmp/$DOWNLOAD_FILE" -d /usr/local/bin
    chmod +x /usr/local/bin/snell-server
    
    ensure_snell_config
    
    # Display the generated or preserved configuration
    print_success "Configuration ready:"
    echo "----------------------------------------"
    cat /etc/snell/snell-server.conf
    echo "----------------------------------------"
    
    # Create systemd service file
    print_status "Creating systemd service file..."
    cat > /lib/systemd/system/snell.service << 'EOF'
[Unit]
Description=Snell Proxy Service
After=network.target

[Service]
Type=simple
User=nobody
Group=nogroup
LimitNOFILE=32768
ExecStart=/usr/local/bin/snell-server -c /etc/snell/snell-server.conf
AmbientCapabilities=CAP_NET_BIND_SERVICE
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=snell-server

[Install]
WantedBy=multi-user.target
EOF

    # Check if nogroup exists, if not use nobody
    if ! getent group nogroup > /dev/null 2>&1; then
        print_warning "nogroup not found, using nobody group instead"
        sed -i 's/Group=nogroup/Group=nobody/' /lib/systemd/system/snell.service
    fi
    
    # Reload systemd daemon
    print_status "Reloading systemd daemon..."
    systemctl daemon-reload
    
    # Enable and start Snell service
    print_status "Enabling Snell service for auto-start..."
    systemctl enable snell
    
    print_status "Starting Snell service..."
    systemctl start snell
    
    # Wait a moment for service to start
    sleep 2
    
    # Check service status
    if systemctl is-active --quiet snell; then
        print_success "Snell service installed and running successfully!"
        display_management_commands
    else
        print_error "Snell service failed to start. Checking logs..."
        journalctl -u snell --no-pager -l
        exit 1
    fi
fi

print_success "Operation completed successfully!"
display_surge_config

# Clean up
rm -f /tmp/"$DOWNLOAD_FILE"
