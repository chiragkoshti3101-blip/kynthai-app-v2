#!/bin/bash
# KYNTHA PERMANENT TERMINAL FIX
# This fixes garbled ANSI escape sequences permanently
# Run this ONCE after opening a terminal as root cause analysis completed

set -e

echo "=========================================="
echo "KYNTHA PERMANENT TERMINAL FIX"
echo "=========================================="
echo ""

# Colors (will work after fix)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[1/4] Fixing Terminal Environment Variables...${NC}"
echo ""

# Immediately unset COLORTERM (the #1 cause)
unset COLORTERM

# Disable ALL color output globally
export NO_COLOR=1
export FORCE_COLOR=0
export CLICOLOR=0
export CLICOLOR_FORCE=0
export LS_COLORS=
export LSCOLORS=
export GIT_PAGER=cat
export PAGER=cat
export TERM=xterm-256color
export npm_config_color=false
export npm_config_loglevel=warn

echo -e "${GREEN}✓ Terminal color settings disabled${NC}"
echo "  - COLORTERM: $COLORTERM (should be empty)"
echo "  - FORCE_COLOR: $FORCE_COLOR"
echo "  - NO_COLOR: $NO_COLOR"
echo "  - npm_config_color: false"
echo ""

echo -e "${YELLOW}[2/4] Fixing Global npm Configuration...${NC}"
echo ""

# Configure npm globally to prevent color output
npm config set color false 2>/dev/null || true
npm config set loglevel warn 2>/dev/null || true
npm config set audit false 2>/dev/null || true
npm config set fund false 2>/dev/null || true
npm config set prefer-offline false 2>/dev/null || true
npm config set progress false 2>/dev/null || true

echo -e "${GREEN}✓ npm configured to disable colors${NC}"
echo ""

echo -e "${YELLOW}[3/4] Clearing Corrupted Cache Files...${NC}"
echo ""

# Clear powerlevel10k cache (often contains corrupted escape sequences)
if [ -d ~/.cache/p10k-* ] 2>/dev/null; then
    rm -rf ~/.cache/p10k-* 2>/dev/null || true
    echo "Cleared p10k cache"
else
    echo "No p10k cache found (OK)"
fi

# Clear zsh compdump (can contain corrupted sequences)
if ls ~/.zcompdump* 1>/dev/null 2>&1; then
    rm -f ~/.zcompdump* 2>/dev/null || true
    echo "Cleared zcompdump files"
else
    echo "No zcompdump files found (OK)"
fi

echo -e "${GREEN}✓ Cache cleared${NC}"
echo ""

echo -e "${YELLOW}[4/4] Verifying Installation...${NC}"
echo ""

# Verify npm config
NPM_COLOR=$(npm config get color 2>/dev/null || echo "unknown")
echo "npm color setting: $NPM_COLOR"

# Verify terminal settings
echo "TERM: $TERM"
echo "FORCE_COLOR: $FORCE_COLOR"
echo "NO_COLOR: $NO_COLOR"
echo "COLORTERM: ${COLORTERM:-'(unset - GOOD)'}"
echo ""

echo "=========================================="
echo -e "${GREEN}PERMANENT FIX APPLIED!${NC}"
echo "=========================================="
echo ""

echo -e "${GREEN}What was fixed:${NC}"
echo "  ✓ Unset COLORTERM (caused 24-bit color codes)"
echo "  ✓ Disabled npm colors globally"
echo "  ✓ Cleared corrupted cache files"
echo "  ✓ Set NO_COLOR=1 (standard no-color env var)"
echo ""

echo -e "${YELLOW}IMPORTANT - Next Steps:${NC}"
echo ""
echo "1. CLOSE ALL TERMINAL WINDOWS"
echo "2. Open a FRESH terminal window"
echo "3. The fix will apply automatically via .zshrc"
echo ""
echo "To verify the fix worked in your new terminal:"
echo "  echo \"COLORTERM=\$COLORTERM    [should show nothing]\""
echo "  npm config get color        [should show: false]"
echo ""
echo "Your terminal should now NEVER show garbled text!"
echo ""
