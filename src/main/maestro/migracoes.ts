/**
 * Migrações do Maestro. Quem mantém db.ts acrescenta estes itens ao fim de MIGRACOES (em ordem).
 * Sem REFERENCES para projeto/task (tabelas de outras etapas): ao excluir projeto ou task,
 * chame apagarChatDoProjeto / desligarTask (store.ts).
 */
export const MIGRACOES_MAESTRO: string[] = [
  `
  CREATE TABLE mensagem_chat (
    id                TEXT PRIMARY KEY,
    projeto_id        TEXT NOT NULL,
    task_id           TEXT,
    autor             TEXT NOT NULL,
    texto             TEXT NOT NULL,
    tipo              TEXT,
    acoes             TEXT NOT NULL DEFAULT '[]',
    resolvida         INTEGER NOT NULL DEFAULT 0,
    proposta_tipo     TEXT,
    proposta_texto    TEXT,
    proposta_carta_id TEXT,
    artefato_id       TEXT,
    lida              INTEGER NOT NULL DEFAULT 1,
    criado_em         INTEGER NOT NULL
  );
  CREATE INDEX mensagem_chat_1 ON mensagem_chat (projeto_id, criado_em);
  CREATE TABLE maestro_sessao (
    projeto_id TEXT PRIMARY KEY,
    cli        TEXT NOT NULL,
    sessao     TEXT NOT NULL
  );
  CREATE TABLE maestro_aviso (
    task_id TEXT NOT NULL,
    tipo    TEXT NOT NULL,
    PRIMARY KEY (task_id, tipo)
  );
  `,
]
