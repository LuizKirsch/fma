# tako

Orquestrador de agentes de IA para desenvolvimento. Os cards chegam de boards por MCP, passam por um fluxo configurável por projeto e cada um roda num git worktree próprio, com agentes como Claude Code, Codex CLI, Gemini CLI e Ollama.

App desktop para Windows, macOS e Linux. Documentação e requisitos no vault do projeto (prefixo `TAK`).

## Stack

- Node.js + TypeScript
- Electron (o mesmo Chromium nas três plataformas)
- `electron-builder` para gerar os instaladores
- SDK oficial de MCP (`@modelcontextprotocol/sdk`)

## Rodar

Precisa do Node.js 22.12 ou mais novo.

```bash
npm install
npm start
```

## Gerar o instalador

```bash
npm run dist          # para o sistema atual
npm run dist:win      # Windows (NSIS)
npm run dist:mac      # macOS (DMG)
npm run dist:linux    # Linux (AppImage e deb)
```

Os arquivos saem em `release/`.

## Estrutura

```
src/
  main/       processo principal: o núcleo, com acesso ao sistema
  preload/    ponte segura entre a interface e o núcleo (window.tako)
  renderer/   interface (HTML, CSS e TypeScript)
  shared/     tipos usados pelos dois lados
scripts/      tarefas de build em Node, iguais em qualquer sistema
```
