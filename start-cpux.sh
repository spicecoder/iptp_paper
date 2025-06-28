#!/bin/bash

# Absolute path to project directory
PROJECT_DIR="$(cd "$(dirname "$0")"; pwd)"

function run_mac_terminal {
  osascript <<EOF
tell application "Terminal"
    do script "cd \"$PROJECT_DIR\"; $1"
end tell
EOF
}

echo "Starting CPUX System on macOS..."

# Start Object Server
run_mac_terminal "echo '[O1] Starting Object Server...'; node object-server.js"

# Start DN Servers DN1 to DN5
for i in {1..5}
do
  PORT=$((5000 + $i))
  DN_ID="DN$i"
  run_mac_terminal "echo '[$DN_ID] Starting on port $PORT...'; DN_ID=$DN_ID PORT=$PORT node dn-server.js"
done

# Wait before starting CPUX orchestrator
sleep 2

# Start CPUX Server
run_mac_terminal "echo '[CPUX] Starting License Flow...'; node cpux-server.js"

echo "All components launched in macOS Terminal windows."
