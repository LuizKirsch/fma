/**
 * Migrações das cartas de apoio e do PR. Quem monta o banco (db.ts) acrescenta
 * `...MIGRACOES_APOIO` ao fim de MIGRACOES. Sem FOREIGN KEY para projeto/task/carta:
 * essas tabelas são de outros módulos; a limpeza em cascata fica por conta de `removerCartaApoio`.
 * Nomes: `apoio_artefato` e `apoio_pr` guardam as entidades Artefato e Pull Request (prefixo evita choque com o motor).
 */
export const MIGRACOES_APOIO: string[] = [
  `
  CREATE TABLE carta_apoio (
    id         TEXT PRIMARY KEY,
    projeto_id TEXT NOT NULL,
    tipo       TEXT NOT NULL,
    nome       TEXT NOT NULL,
    ambiente   TEXT NOT NULL DEFAULT 'homologacao',
    url_base   TEXT NOT NULL DEFAULT '',
    x          INTEGER NOT NULL DEFAULT 0,
    y          INTEGER NOT NULL DEFAULT 0,
    mcp        TEXT
  );
  CREATE INDEX carta_apoio_projeto ON carta_apoio(projeto_id);
  CREATE TABLE carta_apoio_uso (
    carta_apoio_id TEXT NOT NULL REFERENCES carta_apoio(id) ON DELETE CASCADE,
    carta_id       TEXT NOT NULL,
    PRIMARY KEY (carta_apoio_id, carta_id)
  );
  CREATE TABLE task_apoio_desligado (
    task_id        TEXT NOT NULL,
    carta_apoio_id TEXT NOT NULL REFERENCES carta_apoio(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, carta_apoio_id)
  );
  CREATE TABLE apoio_artefato (
    id             TEXT PRIMARY KEY,
    task_id        TEXT NOT NULL,
    carta_apoio_id TEXT NOT NULL,
    carta_id       TEXT NOT NULL,
    titulo         TEXT NOT NULL,
    texto          TEXT NOT NULL DEFAULT '',
    ambiente       TEXT,
    situacao       TEXT NOT NULL,
    antes          TEXT,
    depois         TEXT,
    acao           TEXT,
    criado_em      INTEGER NOT NULL
  );
  CREATE INDEX apoio_artefato_task ON apoio_artefato(task_id);
  CREATE TABLE apoio_pr (
    id      TEXT PRIMARY KEY,
    task_id TEXT NOT NULL UNIQUE,
    numero  INTEGER NOT NULL,
    titulo  TEXT NOT NULL,
    corpo   TEXT NOT NULL DEFAULT '',
    branch  TEXT NOT NULL,
    url     TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE memoria_item (
    id         TEXT PRIMARY KEY,
    projeto_id TEXT NOT NULL,
    titulo     TEXT NOT NULL,
    texto      TEXT NOT NULL,
    criado_em  INTEGER NOT NULL
  );
  CREATE INDEX memoria_projeto ON memoria_item(projeto_id);
  `,
]
