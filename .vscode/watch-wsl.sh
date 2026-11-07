#!/usr/bin/env bash
set -e
# Initialize nvm so yarn/node/tsc are on PATH (non-login shells don't source .bashrc)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.21.0
cd /mnt/c/Users/saidake/Desktop/DevProjects/code-trace-tree-vscode/main
yarn run watch