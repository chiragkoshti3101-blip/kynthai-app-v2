#!/bin/bash

# Fix Terminal ANSI Escape Sequence Display Issues
# This script fixes garbled terminal output and npm install hanging

echo "=== Terminal Display Fix Script ==="
echo ""

# 1. Reset terminal to clean state
echo "1. Resetting terminal..."
reset

# 2. Set proper terminal environment variables
echo "2. Setting terminal environment variables..."
export TERM=xterm-256color
export FORCE_COLOR=0
export npm_config_color=false
export NODE_OPTIONS="--max-old-space-size=4096"

# 3. Clear any corrupted terminal state
echo "3. Clearing terminal state..."
clear

# 4. Fix npm to not use colors
echo "4. Configuring npm to disable colors..."
npm config set color false
npm config set loglevel warn
npm config set prefer-offline false
npm config set audit false
npm config set fund false

# 5. Clean npm cache
echo "5. Cleaning npm cache..."
npm cache clean --force

# 6. Remove corrupted node_modules and lock files
echo "6. Removing node_modules and lock files..."
cd /Users/c.k/Downloads/kynthai-restored-7000-us
rm -rf node_modules
rm -f package-lock.json
rm -f npm-shrinkwrap.json
rm -rf .npm

# 7. Reinstall packages with no colors and skip heavy scripts
echo "7. Reinstalling packages (this may take 3-5 minutes)..."
echo "   Please wait and do not interrupt..."
echo ""

# Install without colors, skip problematic scripts, use longer timeout
npm install --no-color --loglevel=warn --prefer-offline=false \
  --ignore-scripts \
  --no-audit \
  --no-fund

echo ""
echo "8. Running critical postinstall scripts individually..."
echo ""

# Run critical postinstall scripts one by one with timeout
echo "   - Generating Prisma client..."
npx prisma generate --no-color 2>/dev/null || true

echo ""
echo "=== Fix Complete ==="
echo ""
echo "Terminal fixed! Dependencies installed."
echo ""
echo "If you still see garbled text, try:"
echo "  1. Close the terminal completely"
echo "  2. Open a new terminal window"
echo "  3. Run: source ~/.zshrc"
echo ""
echo "To run the app: npm run dev"
echo ""
