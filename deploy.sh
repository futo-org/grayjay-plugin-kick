#!/bin/sh
set -eu

PRE_RELEASE=${PRE_RELEASE:-false}  # Default to false if not set

# Plugin file names (must be set via environment variables)
ICON_FILE=${ICON_FILE:?"ICON_FILE environment variable is required"}
SCRIPT_FILE=${SCRIPT_FILE:?"SCRIPT_FILE environment variable is required"}
CONFIG_FILE=${CONFIG_FILE:?"CONFIG_FILE environment variable is required"}
PLUGIN_NAME=${PLUGIN_NAME:?"PLUGIN_NAME environment variable is required"}

# Determine deployment directory
if [ "$PRE_RELEASE" = "true" ]; then
    RELATIVE_PATH="unstable/$PLUGIN_NAME"
else
    RELATIVE_PATH="$PLUGIN_NAME"
fi

sh "$(dirname "$0")/publish-r2.sh" "$RELATIVE_PATH" "$CONFIG_FILE" "$(basename "$CONFIG_FILE")" "$SCRIPT_FILE" "$ICON_FILE"
