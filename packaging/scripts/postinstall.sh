#!/bin/sh
set -e

systemctl daemon-reload >/dev/null 2>&1 || true

if [ -d /run/systemd/system ] && systemctl is-active --quiet sitrep.service; then
    systemctl restart sitrep.service >/dev/null 2>&1 || true
fi
    