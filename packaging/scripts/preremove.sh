#!/bin/sh
# Runs on removal and, on rpm, on upgrade too — "$1" is 1 there, so only stop
# the unit when the package is going away for good.
set -e

if [ "$1" = "upgrade" ] || [ "$1" = "1" ]; then
    exit 0
fi

if [ -d /run/systemd/system ]; then
    systemctl --no-reload disable --now sitrep.service >/dev/null 2>&1 || true
fi
