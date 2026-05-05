#!/usr/bin/env bash
# Verify that every --ij-* token referenced in our CSS exists in the vendored
# design system file. Fails loudly if the upstream design system has renamed
# or removed a token we rely on.
#
# Run manually:   ./scripts/check-tokens.sh
# Or wire into CI as a pre-deploy check.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/iamjarl-tokens.css"
SOURCES=("$ROOT/styles" "$ROOT/index.html" "$ROOT/src")

if [[ ! -f "$VENDOR" ]]; then
  echo "✗ Missing $VENDOR" >&2
  exit 1
fi

# Collect every --ij-* token we *use* in our code (left of the comma in var()).
used=$(grep -rhoE 'var\(--ij-[a-z0-9-]+' "${SOURCES[@]}" \
  | sed -E 's/var\(//' \
  | sort -u)

# Collect every --ij-* token *defined* in the vendored design system.
defined=$(grep -oE -- '--ij-[a-z0-9-]+' "$VENDOR" | sort -u)

missing=$(comm -23 <(printf '%s\n' "$used") <(printf '%s\n' "$defined"))

if [[ -n "$missing" ]]; then
  echo "✗ The following design tokens are referenced but not defined in" >&2
  echo "  $VENDOR" >&2
  echo "$missing" | sed 's/^/    /' >&2
  echo "" >&2
  echo "  The vendored copy may be out of date or upstream renamed a token." >&2
  exit 1
fi

count=$(printf '%s\n' "$used" | wc -l | tr -d ' ')
version=$(grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' "$VENDOR" | head -1 || echo "unknown")
echo "✓ All $count design tokens resolve against vendored design system ($version)."
