#!/usr/bin/env bash
# vsr_eval.sh — Launch Chrome in its own cgroup; log CPU/RAM/GPU + direct CPU% via systemd-cgtop.
set -euo pipefail
LC_ALL=C
LC_NUMERIC=C

URL="${1:-}"

if [[ -z "$URL" ]]; then
  echo "Example: $0 http://localhost:8000"
  exit 1
fi
UNIT="vsr-chrome"

# 1) Launch Chrome as a transient user service (keeps whole tree in one cgroup)
systemd-run --user \
  --unit="$UNIT" \
  --property=Type=exec \
  --property=Slice=app.slice \
  --property=CPUAccounting=yes \
  --property=MemoryAccounting=yes \
  --collect \
  bash -lc 'exec google-chrome \
    --user-data-dir=/tmp/vsr-profile-$$ \
    --no-first-run --disable-extensions \
    --remote-debugging-port=9222 \
    --enable-unsafe-webgpu \
    --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan \
    --use-angle=vulkan \
    '"$URL"'' >/dev/null