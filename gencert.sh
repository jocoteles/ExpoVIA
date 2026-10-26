#!/usr/bin/env bash
set -e

CERT_DIR="cert"
CERT_FILE="$CERT_DIR/dev.pem"
KEY_FILE="$CERT_DIR/dev-key.pem"

echo "== Gerador de certificado para https local =="

# Verifica mkcert.
if ! command -v mkcert >/dev/null 2>&1; then
    echo
    echo "ERRO: mkcert não está instalado."
    echo
    echo "Instale com:"
    echo "    sudo apt install mkcert"
    exit 1
fi

mkdir -p "$CERT_DIR"

echo "Gerando certificado..."

HOST_NAME=$(hostname 2>/dev/null || echo "localhost")

mkcert \
    -cert-file "$CERT_FILE" \
    -key-file "$KEY_FILE" \
    localhost 127.0.0.1 ::1 "$HOST_NAME" "$HOST_NAME.local"
