#!/bin/bash

echo "🛑 Desativando o Hotspot..."

# Tenta desligar a conexão do Hotspot
if nmcli connection down Hotspot; then
    echo "✅ Hotspot desligado com sucesso!"
else
    echo "❌ Erro: Não foi possível desativar o Hotspot."
    exit 1
fi
