#!/usr/bin/env bash

set -euo pipefail

server_ip="${1:-}"
replace_existing="${2:-}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cert_dir="${repo_root}/nginx/certs"

if [[ -n "${server_ip}" ]]; then
  if ! python3 -c 'import ipaddress, sys; ipaddress.IPv4Address(sys.argv[1])' "${server_ip}" 2>/dev/null; then
    echo "Usage: $0 [server-ipv4] [--replace]" >&2
    echo "The server IP must be a valid IPv4 address." >&2
    exit 2
  fi
fi

if [[ -n "${replace_existing}" && "${replace_existing}" != "--replace" ]]; then
  echo "Usage: $0 [server-ipv4] [--replace]" >&2
  exit 2
fi

mkdir -p "${cert_dir}"
chmod 700 "${cert_dir}"

if [[ -f "${cert_dir}/server.crt" && -f "${cert_dir}/server.key" ]]; then
  if [[ -n "${server_ip}" ]] && openssl verify \
    -CAfile "${cert_dir}/server.crt" -verify_ip "${server_ip}" "${cert_dir}/server.crt" >/dev/null 2>&1; then
    echo "The existing certificate already covers ${server_ip}."
    exit 0
  fi
  if [[ "${replace_existing}" != "--replace" ]]; then
    echo "A TLS certificate already exists at ${cert_dir}."
    echo "It does not cover ${server_ip:-localhost}; rerun with --replace to generate a matching certificate."
    exit 1
  fi
fi

temporary_dir="$(mktemp -d "${cert_dir}/.certificate.XXXXXX")"
trap 'rm -rf "${temporary_dir}"' EXIT
subject_alt_names="DNS:localhost,IP:127.0.0.1"
if [[ -n "${server_ip}" ]]; then
  subject_alt_names+=",IP:${server_ip}"
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${temporary_dir}/server.key" \
  -out "${temporary_dir}/server.crt" \
  -subj "/CN=${server_ip:-localhost}" \
  -addext "subjectAltName=${subject_alt_names}"

chmod 600 "${temporary_dir}/server.key"
chmod 644 "${temporary_dir}/server.crt"
mv -f "${temporary_dir}/server.key" "${cert_dir}/server.key"
mv -f "${temporary_dir}/server.crt" "${cert_dir}/server.crt"
echo "Generated a self-signed HTTPS certificate for ${server_ip:-localhost}."
echo "Trust server.crt on each client device; do not distribute server.key."
