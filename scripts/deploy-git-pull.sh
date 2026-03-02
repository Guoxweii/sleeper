#!/usr/bin/env bash

set -euo pipefail

DEPLOY_BRANCH="${DEPLOY_BRANCH:-}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_WITH_BUILD="${DEPLOY_WITH_BUILD:-1}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '%s\n' "当前目录不是 Git 仓库，无法执行 git pull 发布。"
  exit 1
fi

if [[ -z "${DEPLOY_BRANCH}" ]]; then
  DEPLOY_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi

if [[ "${DEPLOY_BRANCH}" == "HEAD" ]]; then
  printf '%s\n' "当前是 detached HEAD，请显式指定 DEPLOY_BRANCH。"
  printf '%s\n' "示例：DEPLOY_BRANCH=main npm run publish"
  exit 1
fi

printf '%s\n' "拉取最新代码: ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
git fetch "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"
git pull --ff-only "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"

if [[ "${DEPLOY_WITH_BUILD}" == "1" ]]; then
  printf '%s\n' "执行容器重建发布（含 build）"
  docker compose up -d --build --remove-orphans
else
  printf '%s\n' "执行容器发布（不重建镜像）"
  docker compose up -d --remove-orphans
fi
