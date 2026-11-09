#!/bin/sh
set -eu
set -f
write_map() {
    variable=$1
    name=$2
    values=$3
    exact=$4
    printf 'map $%s $%s {\n    default 0;\n' "$variable" "$name"
    for value in $values; do
        if printf '%s\n' "$value" | LC_ALL=C grep -Eq '^[][A-Za-z0-9._:/-]+$'; then
            if [ "$exact" = 1 ]; then
                printf '    "%s" "%s";\n' "$value" "$value"
            else
                printf '    "%s" 1;\n' "$value"
            fi
        else
            printf '%s\n' '不正な許可リストの値を無視した' >&2
        fi
    done
    printf '}\n'
}
{
    write_map http_origin viewer_origin_allowed "${VIEWER_ALLOWED_ORIGINS:-}" 0
    write_map http_host viewer_host_allowed "${VIEWER_ALLOWED_HOSTS:-}" 0
    write_map http_origin viewer_origin_exact "${VIEWER_ALLOWED_ORIGINS:-}" 1
    write_map http_host viewer_host_exact "${VIEWER_ALLOWED_HOSTS:-}" 1
} > /etc/nginx/conf.d/00-viewer-allowlist.conf
