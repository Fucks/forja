---
key: HUM-04
title: "Preparar a máquina: Docker Desktop, credencial, preços e imagem do agente"
type: human
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:infra, area:harness]
depends_on: []
---

## Contexto
O primeiro uso real da Forja exige Docker rodando, uma credencial do Claude e a imagem do agente construída. Os preços
padrão por modelo (#{RT-05}) foram escritos sem conferência e precisam ser checados na página oficial de preços.

## O que fazer
1. Confirmar Docker Desktop instalado e rodando no Windows (com integração WSL 2 se for o backend).
2. Gerar `claude setup-token` (assinatura) ou uma API key no Console da Anthropic; cadastrar na tela de credenciais quando ela existir.
3. Conferir os preços de Opus, Sonnet, Haiku e Fable em https://www.anthropic.com/pricing e ajustar `DEFAULT_MODEL_PRICES` (PR) ou as configurações globais.
4. Construir a imagem do agente pela tela do projeto (ou `docker build` com `assets/agent-image/Dockerfile`) e verificar o diagnóstico verde.

## Resultado esperado
Diagnóstico da Forja todo verde na máquina do autor; preços conferidos.
