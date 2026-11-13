#!/bin/sh
set -eu

# The server only listens on 127.0.0.1 (#86). socat relays the container's own address to it, so
# the port published on the host's loopback reaches it without the server listening on the network.
loopback_host=127.0.0.1
container_ip=$(hostname -i | cut -d ' ' -f 1)

socat "TCP-LISTEN:${FORJA_PORT},bind=${container_ip},fork,reuseaddr" \
    "TCP:${loopback_host}:${FORJA_PORT}" &

exec forja --no-open "$@"
