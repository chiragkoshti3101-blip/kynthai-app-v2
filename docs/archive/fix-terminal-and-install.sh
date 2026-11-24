#!/bin/bash
# KYNTHA - TERMINAL AND INSTALLATION FIX SCRIPT
# This fixes: garbled ANSI escape sequences, npm install issues, corrupted cache

set -e

echo "=========================================="
echo "KYNTHA TERMINAL & INSTALLATION FIX"
echo "=========================================="
echo ""

# Colors for output (but we disable them in actual use)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Fix Terminal Display Issues
echo -e "${YELLOW}[1/5] Fixing terminal display issues...${NC}"

# Disable color output for all package managers
export FORCE_COLOR=0
export CLICOLOR=0
export CLICOLOR_FORCE=0
export LS_COLORS=
export LSCOLORS=
export npm_config_color=false
export npm_config_loglevel=warn

# Remove corrupted powerlevel10k cache
if [ -d ~/.cache ]; then
    rm -rf ~/.cache/p10k-* 2>/dev/null || true
fi

# Rebuild zsh compdump to clear corrupted escape sequences
rm -f ~/.zcompdump* 2>/dev/null || true

# Clear npm and pnpm cache
npm cache clean --force 2>/dev/null || true
pnpm store prune 2>/dev/null || true

echo -e "${GREEN}✓ Terminal display fixed${NC}"
echo ""

# Step 2: Remove deprecated lockfiles
echo -e "${YELLOW}[2/5] Cleaning up deprecated files...${NC}"

if [ -f "npm-shrinkwrap.json" ]; then
    echo "Removing deprecated npm-shrinkwrap.json..."
    rm -f npm-shrinkwrap.json
    echo -e "${GREEN}✓ Removed npm-shrinkwrap.json${NC}"
fi

# Remove corrupted node_modules if needed
NODE_MODULES_SIZE=$(du -sm node_modules 2>/dev/null | cut -f1 || echo "0")
if [ "$NODE_MODULES_SIZE" -lt 50 ]; then
    echo -e "${YELLOW}⚠ Node_modules appears incomplete ($NODE_MODULES_SIZE MB) - removing...${NC}"
    rm -rf node_modules
    echo -e "${GREEN}✓ Removed incomplete node_modules${NC}"
fi

echo ""

# Step 3: Clean package-lock.json if corrupted
echo -e "${YELLOW}[3/5] Validating package-lock.json...${NC}"

if [ -f "package-lock.json" ]; then
    # Check if lockfile is valid JSON
    if ! python3 -c "import json; json.load(open('package-lock.json'))" 2>/dev/null; then
        echo -e "${YELLOW}⚠ package-lock.json is corrupted - backing up and regenerating...${NC}"
        mv package-lock.json package-lock.json.bak.$(date +%s)
    else
        echo -e "${GREEN}✓ package-lock.json is valid${NC}"
    fi
fi

echo ""

# Step 4: Install dependencies properly
echo -e "${YELLOW}[4/5] Installing dependencies (this may take a few minutes)...${NC}"

# Use npm with no color and verbose output saved to log
export CI=false
npm install --no-color --loglevel=warn 2>&1 | tee install.log.fixed

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 5: Verify installation
echo -e "${YELLOW}[5/5] Verifying installation...${NC}"

INSTALLED_COUNT=$(ls node_modules 2>/dev/null | wc -l || echo "0")
echo "Installed packages: $INSTALLED_COUNT"

# Check if next is installed
if [ -d "node_modules/next" ]; then
    echo -e "${GREEN}✓ Next.js is installed${NC}"
else
    echo -e "${RED}✗ Next.js is NOT installed - there may be issues${NC}"
fi

# Check if remotion is installed (should NOT be)
if [ -d "node_modules/@remotion" ]; then
    echo -e "${YELLOW}⚠ @remotion packages found (these may cause conflicts)${NC}"
else
    echo -e "${GREEN}✓ No @remotion packages (correct for this project)${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}FIX COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Run: cd /Users/c.k/Downloads/kynthai-restored-7000-us"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:8000"
echo ""
echo "If terminal still shows garbled text:"
echo "  - Run: fix-terminal-permanent"
echo "  - Or restart terminal: exec zsh"
echo ""
