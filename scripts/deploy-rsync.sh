#!/usr/bin/env bash

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@local-nas}"
DEPLOY_PATH="${DEPLOY_PATH:-/volume1/docker/sleeper}"
DEPLOY_WITH_BUILD="${DEPLOY_WITH_BUILD:-1}"

printf '%s\n' "同步文件到 ${DEPLOY_HOST}:${DEPLOY_PATH}"

rsync -avz -o --delete \
  --exclude='node_modules/' \
  --exclude='.env' \
  --exclude='data/' \
  --exclude='.git/' \
  --exclude='.DS_Store' \
  ./ "${DEPLOY_HOST}:${DEPLOY_PATH}/"

if [[ "${DEPLOY_WITH_BUILD}" == "1" ]]; then
  printf '%s\n' "执行容器重建发布（含 build）"
  ssh "${DEPLOY_HOST}" "cd ${DEPLOY_PATH} && docker compose up -d --build --remove-orphans"
else
  printf '%s\n' "执行容器发布（不重建镜像）"
  ssh "${DEPLOY_HOST}" "cd ${DEPLOY_PATH} && docker compose up -d --remove-orphans"
fi

printf '%s\n' "部署完成！"
