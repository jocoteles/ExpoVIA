#!/bin/bash

echo "📡 Ativando o Hotspot..."

# Tenta ligar o hotspot. O 'if' garante que o Node só roda se o nmcli funcionar.
if nmcli connection up Hotspot; then
    echo "✅ Hotspot ativado com sucesso!"
    echo "🚀 Iniciando o servidor Node.js..."
    
    # Executa o node server.js
    node server.js
else
    echo "❌ Erro: Não foi possível ativar o Hotspot. O servidor Node não foi iniciado."
    exit 1
fi
