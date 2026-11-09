#!/bin/bash
# Run on the build machine inside the clone. Builds the committed tree and ships it to the robot PC.
# Usage: scripts/deploy.sh <robot-ssh-destination>
set -euo pipefail

if [ "$#" -ne 1 ] || [[ "$1" == -* ]]; then
    echo "usage: $0 <robot-ssh-destination>" >&2
    exit 2
fi
robotTarget="$1"
repositoryRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repositoryRoot}"

if [ -n "$(git status --porcelain)" ]; then
    echo "uncommitted changes: commit before running (the image tag is the commit SHA)" >&2
    exit 1
fi
imageName="tsukuchalle-viewer"
imageTag="$(git rev-parse --short HEAD)"

buildArchitecture="$(uname -m)"
robotArchitecture="$(ssh "${robotTarget}" uname -m)"
if [ "${buildArchitecture}" != "${robotArchitecture}" ]; then
    echo "architecture mismatch: build=${buildArchitecture} robot=${robotArchitecture}" >&2
    exit 1
fi

docker build -t "${imageName}:${imageTag}" .
docker save "${imageName}:${imageTag}" | gzip | ssh "${robotTarget}" "gunzip | docker load"
ssh "${robotTarget}" "docker tag ${imageName}:${imageTag} ${imageName}:latest"

ssh "${robotTarget}" "mkdir -p ~/tsukuchalle_viewer"
scp compose.yaml "${robotTarget}:~/tsukuchalle_viewer/"

cat <<MESSAGE
deployed ${imageName}:${imageTag} (also latest) and compose.yaml to ${robotTarget}:~/tsukuchalle_viewer/
On the robot PC:
  cd ~/tsukuchalle_viewer
  # .env (README): VIEWER_PORT (default 8080) and VIEWER_BRIDGE_PORT (default 8765)
  docker compose up -d
MESSAGE
