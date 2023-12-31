set -euo pipefail

TEMPLATE="${1}"
source /dev/stdin <<EOF
cat <<EOF_INNER
$(cat "${TEMPLATE}")
EOF_INNER
EOF
