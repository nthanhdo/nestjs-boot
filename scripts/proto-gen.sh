#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# proto-gen.sh — Generate TypeScript types from .proto files using ts-proto
#
# Usage:
#   ./scripts/proto-gen.sh <proto-dir> <output-dir>
#
# Examples:
#   ./scripts/proto-gen.sh proto/ generated/
#   ./scripts/proto-gen.sh src/proto out/types
#
# Output:
#   One .ts file per .proto file, containing:
#   - Typed request/response interfaces
#   - A typed client interface matching ServiceClient<T> generic
#   - Enum definitions
#
# Prerequisites:
#   npm install --save-dev ts-proto grpc-tools
#   (or: npx ts-proto directly, see fallback below)
#
# Options (set as env vars before running):
#   KEEP_CASE=true       Preserve field names as-is (default: false → camelCase)
#   FORCE_SERVER_NONE=1  Disable server stub generation (client-only mode, default: 1)
#   NEST_MODE=1          Generate NestJS-compatible decorators (default: 0)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROTO_DIR="${1:-proto}"
OUT_DIR="${2:-generated}"

# ── Validation ──────────────────────────────────────────────────────────────

if [ ! -d "$PROTO_DIR" ]; then
  echo "❌  Proto directory not found: $PROTO_DIR"
  echo "    Usage: $0 <proto-dir> <output-dir>"
  exit 1
fi

PROTO_FILES=("$PROTO_DIR"/*.proto)
if [ ${#PROTO_FILES[@]} -eq 0 ] || [ ! -f "${PROTO_FILES[0]}" ]; then
  echo "❌  No .proto files found in: $PROTO_DIR"
  exit 1
fi

# ── Setup ───────────────────────────────────────────────────────────────────

mkdir -p "$OUT_DIR"

# ts-proto options
KEEP_CASE="${KEEP_CASE:-false}"
FORCE_SERVER_NONE="${FORCE_SERVER_NONE:-1}"
NEST_MODE="${NEST_MODE:-0}"

TS_PROTO_OPT="esModuleInterop=true"
TS_PROTO_OPT+=",keepCase=${KEEP_CASE}"
TS_PROTO_OPT+=",outputClientImpl=false"         # we use ServiceClient<T>, not generated client impls
TS_PROTO_OPT+=",nestJs=${NEST_MODE}"
if [ "$FORCE_SERVER_NONE" = "1" ]; then
  TS_PROTO_OPT+=",forceServerNone=true"
fi

# ── Find protoc ─────────────────────────────────────────────────────────────

PROTOC=""
if command -v protoc &>/dev/null; then
  PROTOC="protoc"
elif [ -f "node_modules/.bin/grpc_tools_node_protoc" ]; then
  PROTOC="node_modules/.bin/grpc_tools_node_protoc"
else
  echo "⚠️   protoc not found in PATH or node_modules/.bin/."
  echo "    Install via: npm install --save-dev grpc-tools"
  echo "    Or install protoc: https://grpc.io/docs/protoc-installation/"
  exit 1
fi

# ── Find ts-proto plugin ─────────────────────────────────────────────────────

PROTOC_GEN_TS_PROTO=""
if [ -f "node_modules/.bin/protoc-gen-ts_proto" ]; then
  PROTOC_GEN_TS_PROTO="node_modules/.bin/protoc-gen-ts_proto"
elif command -v protoc-gen-ts_proto &>/dev/null; then
  PROTOC_GEN_TS_PROTO="$(command -v protoc-gen-ts_proto)"
else
  echo "⚠️   ts-proto plugin not found."
  echo "    Install via: npm install --save-dev ts-proto"
  exit 1
fi

# ── Generate ─────────────────────────────────────────────────────────────────

echo "🔧  Generating TypeScript types from .proto files..."
echo "    Source : $PROTO_DIR"
echo "    Output : $OUT_DIR"
echo "    Options: $TS_PROTO_OPT"
echo ""

for PROTO_FILE in "$PROTO_DIR"/*.proto; do
  BASENAME=$(basename "$PROTO_FILE" .proto)
  echo "  ▸ $PROTO_FILE → $OUT_DIR/${BASENAME}.ts"

  "$PROTOC" \
    --plugin="protoc-gen-ts_proto=${PROTOC_GEN_TS_PROTO}" \
    --ts_proto_out="$OUT_DIR" \
    --ts_proto_opt="$TS_PROTO_OPT" \
    --proto_path="$PROTO_DIR" \
    "$PROTO_FILE"
done

echo ""
echo "✅  Done. Generated files are in: $OUT_DIR"
echo ""
echo "Usage with ServiceClient<T>:"
echo "──────────────────────────────────────────────────────────────"
echo "  // 1. Import the generated interface"
echo "  import { OrderService } from './${OUT_DIR}/order';"
echo ""
echo "  // 2. Create a typed client"
echo "  const client = new ServiceClient<OrderService>(clientProxy);"
echo "  // or with resilience:"
echo "  const client = createResilientClient<OrderService>(clientProxy, {"
echo "    timeout: 5000,"
echo "    retry: { maxAttempts: 3 },"
echo "  });"
echo ""
echo "  // 3. Type-safe call"
echo "  const order = await client.call('findOrder', { id: '123' });"
echo "──────────────────────────────────────────────────────────────"
