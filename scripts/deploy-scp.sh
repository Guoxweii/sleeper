#!/usr/bin/env bash

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@local-nas}"
DEPLOY_PATH="${DEPLOY_PATH:-/volume1/docker/sleeper}"
DEPLOY_PORT="${DEPLOY_PORT:-}"
DEPLOY_WITH_BUILD="${DEPLOY_WITH_BUILD:-1}"

LOCAL_ARCHIVE="$(mktemp "/tmp/sleeper-deploy.XXXXXX.tar.gz")"
REMOTE_ARCHIVE="/tmp/sleeper-deploy-$(date +%s)-$RANDOM.tar.gz"

cleanup() {
  rm -f "${LOCAL_ARCHIVE}"
}
trap cleanup EXIT

SCP_CMD=(scp -O)
SSH_CMD=(ssh)

if [[ -n "${DEPLOY_PORT}" ]]; then
  SCP_CMD+=(-P "${DEPLOY_PORT}")
  SSH_CMD+=(-p "${DEPLOY_PORT}")
fi

printf '%s\n' "打包项目文件"
COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar -czf "${LOCAL_ARCHIVE}" \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./web/node_modules' \
  --exclude='./server/node_modules' \
  --exclude='./data' \
  --exclude='./.DS_Store' \
  .

printf '%s\n' "上传归档到 ${DEPLOY_HOST}:${REMOTE_ARCHIVE}"
"${SCP_CMD[@]}" "${LOCAL_ARCHIVE}" "${DEPLOY_HOST}:${REMOTE_ARCHIVE}"

printf '%s\n' "远程解压到 ${DEPLOY_PATH}"
"${SSH_CMD[@]}" "${DEPLOY_HOST}" "mkdir -p \"${DEPLOY_PATH}\" && tar -xzf \"${REMOTE_ARCHIVE}\" -C \"${DEPLOY_PATH}\" && rm -f \"${REMOTE_ARCHIVE}\""

printf '%s\n' "确保远程数据目录存在"
"${SSH_CMD[@]}" "${DEPLOY_HOST}" "mkdir -p \"${DEPLOY_PATH}/data\""

REMOTE_DOCKER_CMD='if command -v docker >/dev/null 2>&1; then DOCKER_CMD=docker; elif [ -x /usr/local/bin/docker ]; then DOCKER_CMD=/usr/local/bin/docker; else echo "docker command not found"; exit 127; fi; if $DOCKER_CMD compose version >/dev/null 2>&1; then COMPOSE_CMD="$DOCKER_CMD compose"; elif command -v docker-compose >/dev/null 2>&1; then COMPOSE_CMD=docker-compose; elif [ -x /usr/local/bin/docker-compose ]; then COMPOSE_CMD=/usr/local/bin/docker-compose; else echo "docker compose command not found"; exit 127; fi'

if [[ "${DEPLOY_WITH_BUILD}" == "1" ]]; then
  printf '%s\n' "执行容器重建发布（含 build）"
  "${SSH_CMD[@]}" "${DEPLOY_HOST}" "${REMOTE_DOCKER_CMD} && cd \"${DEPLOY_PATH}\" && sh -c \"\$COMPOSE_CMD up -d --build --remove-orphans\""
else
  printf '%s\n' "执行容器发布（不重建镜像）"
  "${SSH_CMD[@]}" "${DEPLOY_HOST}" "${REMOTE_DOCKER_CMD} && cd \"${DEPLOY_PATH}\" && sh -c \"\$COMPOSE_CMD up -d --remove-orphans\""
fi

printf '%s\n' "部署完成！"
