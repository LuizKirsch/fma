# fma

FMA (Fantasy Multi Agents): orquestrador de agentes de IA para desenvolvimento, em formato de jogo de cartas. Cada agente é uma carta com classe, IA, método, skills e prompt; cada projeto é uma mesa onde as cartas se ligam; as demandas chegam de um board por MCP e viram tasks trabalhadas pelo time.

App desktop para Windows, macOS e Linux. Documentação e requisitos no vault do projeto (prefixo `FMA`).

## Stack

- Electron + TypeScript, com build pelo `electron-vite`
- Interface em React 19, Tailwind v4 e componentes shadcn/ui, com o visual do protótipo LMA v13
- Banco local em SQLite (`node:sqlite`, que já vem no Electron)
- As cartas rodam nas CLIs de código instaladas no computador: Claude Code, Codex CLI ou Gemini CLI
- SDK oficial de MCP (`@modelcontextprotocol/sdk`) para os boards e as ferramentas

## Rodar

Precisa do Node.js 22.12 ou mais novo.

```bash
npm install
npm run dev       # abre o app com recarga automática da interface
```

Outros comandos:

```bash
npm run build     # compila para out/
npm start         # abre o app compilado
npm run typecheck # confere os tipos
npm run dist      # gera o instalador do sistema atual (também dist:win, dist:mac, dist:linux)
```

O banco fica na pasta de dados do app (no Windows, `%APPDATA%/fma/fma.db`).

## Estrutura

```
src/
  main/       núcleo: janela, banco, CLIs e a API que a interface chama
  preload/    ponte segura que expõe window.fma para a interface
  renderer/   interface em React (index.html e src/)
  shared/     catálogo, tipos e regras usados pelos dois lados
```

## O que já funciona

- Coleção de cartas: forjar (classes fixas e Coringa), editar, duplicar e excluir, tudo salvo no banco
- Detecção das CLIs instaladas na forja
