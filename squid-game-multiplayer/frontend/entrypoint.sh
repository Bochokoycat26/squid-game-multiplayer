#!/bin/sh
set -eu
: "${GAME_SERVER_URL:=http://localhost:3001}"
cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.RUNTIME_CONFIG = { GAME_SERVER_URL: "${GAME_SERVER_URL}" };
EOF
exec nginx -g 'daemon off;'
