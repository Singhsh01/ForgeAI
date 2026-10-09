# ForgeAI execution sandbox image. Each verification command runs in a throwaway container
# from this image with: --network none (tests), --cap-drop ALL, --security-opt no-new-privileges,
# --read-only root, tmpfs /tmp, memory/cpu/pids limits, and only the disposable workspace mounted.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git make ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

# Run as an unprivileged user by default (ForgeAI also passes --user <host uid>).
USER node
WORKDIR /workspace
ENV CI=1 HOME=/tmp NO_COLOR=1
