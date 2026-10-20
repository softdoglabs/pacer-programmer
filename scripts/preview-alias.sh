#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Soft Dog Labs, LLC
#
# The Cloudflare preview alias for pull request $1: pr-<number>-<16 hex characters>, keyed by the
# PREVIEW_KEY secret. The same pull request always gets the same alias, so its preview addresses
# stay put from push to push, but they can't be worked out from the number alone
# (.github/workflows/ci.yml). That hides nothing a public pull request's own comment gives away; it
# stops anyone listing every preview there is, and is what keeps a private repository's private.
set -euo pipefail
: "${PREVIEW_KEY:?PREVIEW_KEY is not set}"
pr=${1:?usage: preview-alias.sh <pull request number>}
mac=$(printf '%s' "$pr" | openssl dgst -sha256 -hmac "$PREVIEW_KEY" | sed 's/^.*= //')
echo "pr-$pr-${mac:0:16}"
