#!/bin/bash
set -e

echo "=== Family Chore App — Pi Setup ==="

# 1. Install Node.js 20 if not present
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 2. Install dependencies and build
npm ci
npm run build

# 3. Create data directory
mkdir -p data

echo "=== Build complete. Run: npm start ==="
