#!/usr/bin/env bash
# Builds and deploys the web app to Netlify from a clean clone of the committed code, so no local
# .env file can reach the build. Run on Linux or WSL: Netlify's Next.js adapter creates symlinks,
# which Windows refuses without Developer Mode. Needs Node 22+ with pnpm on PATH (e.g.
# `corepack enable pnpm`) and a logged-in Netlify CLI or NETLIFY_AUTH_TOKEN.
#
#   scripts/deploy-netlify.sh <netlify-site-id> [repo-path]
set -euo pipefail
SITE_ID="${1:?usage: scripts/deploy-netlify.sh <netlify-site-id> [repo-path]}"
REPO="${2:-$(git rev-parse --show-toplevel)}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git -c safe.directory='*' clone -q "$REPO" "$WORK/veilprocure"
cd "$WORK/veilprocure"
if ls apps/web/.env* >/dev/null 2>&1; then echo "refusing: .env file in the clone"; exit 1; fi
echo "deploying $(git log -1 --format='%h %s')"

pnpm install --frozen-lockfile
mkdir -p apps/web/.netlify
printf '{"siteId":"%s"}\n' "$SITE_ID" > apps/web/.netlify/state.json
npx -y netlify-cli@27.16.1 deploy --prod --filter @veilprocure/web --site "$SITE_ID" --message "Deploy $(git log -1 --format=%h)" < /dev/null
