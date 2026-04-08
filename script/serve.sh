#!/usr/bin/env bash
# =============================================================================
#  Local Development Server for Jekyll Site
# =============================================================================
#
#  This script sets up and runs a local Jekyll development server with
#  live-reload support. It will:
#
#    1. Verify that Ruby is installed
#    2. Install Bundler if it's not already available
#    3. Install gem dependencies via `bundle install`
#    4. Start the Jekyll dev server with live-reload
#
#  Usage:
#    ./script/serve.sh              # default port 4000
#    ./script/serve.sh -p 8080      # custom port
#    ./script/serve.sh --port 8080  # custom port (long form)
#    PORT=8080 ./script/serve.sh    # custom port (env var)
#
#  The site will be available at http://localhost:<port>
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
#  Parse command-line arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [-p|--port PORT]"
            echo ""
            echo "  -p, --port PORT   Port to serve on (default: 4000)"
            echo "  -h, --help        Show this help message"
            exit 0
            ;;
        *)
            error "Unknown argument: $1"
            echo "Usage: $0 [-p|--port PORT]"
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
#  Configuration
# ---------------------------------------------------------------------------
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-4000}"

# ---------------------------------------------------------------------------
#  Colors & helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; }

# ---------------------------------------------------------------------------
#  Navigate to the repository root (parent of script/)
# ---------------------------------------------------------------------------
cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
#  Trap SIGINT (Ctrl+C) for clean shutdown
# ---------------------------------------------------------------------------
cleanup() {
    echo ""
    info "Shutting down Jekyll server..."
    # Kill background processes in this process group
    kill 0 2>/dev/null || true
    ok "Server stopped. Goodbye!"
    exit 0
}
trap cleanup SIGINT SIGTERM

# ---------------------------------------------------------------------------
#  Step 1: Check for Ruby
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  Jekyll Local Development Server${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

if ! command -v ruby &>/dev/null; then
    error "Ruby is not installed!"
    echo ""
    echo "  Please install Ruby first. Some options:"
    echo ""
    echo "    macOS (Homebrew):   brew install ruby"
    echo "    Ubuntu/Debian:      sudo apt-get install ruby-full"
    echo "    Fedora:             sudo dnf install ruby ruby-devel"
    echo "    Arch:               sudo pacman -S ruby"
    echo "    rbenv:              https://github.com/rbenv/rbenv"
    echo "    asdf:               https://github.com/asdf-vm/asdf"
    echo ""
    exit 1
fi

RUBY_VERSION=$(ruby --version)
ok "Ruby found: ${RUBY_VERSION}"

# ---------------------------------------------------------------------------
#  Step 2: Check for / install Bundler
# ---------------------------------------------------------------------------
if ! command -v bundle &>/dev/null; then
    warn "Bundler not found — installing..."
    gem install bundler
    ok "Bundler installed."
else
    ok "Bundler found: $(bundle --version)"
fi

# ---------------------------------------------------------------------------
#  Step 3: Install gem dependencies (locally in vendor/bundle)
# ---------------------------------------------------------------------------
bundle config set --local path 'vendor/bundle' 2>/dev/null
info "Installing gem dependencies (bundle install)..."
bundle install
ok "Dependencies installed."

# ---------------------------------------------------------------------------
#  Step 4: Start the Jekyll dev server
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}────────────────────────────────────────${NC}"
echo -e "${GREEN}  Starting Jekyll development server${NC}"
echo -e "${BOLD}────────────────────────────────────────${NC}"
echo ""
echo -e "  Local:   ${CYAN}http://localhost:${PORT}${NC}"
echo -e "  Network: ${CYAN}http://${HOST}:${PORT}${NC}"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop the server."
echo ""

bundle exec jekyll serve \
    --host "$HOST" \
    --port "$PORT" \
    --livereload \
    --open-url
