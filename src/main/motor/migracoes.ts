/**
 * Tabelas do motor de tasks. Anexe ao FIM de MIGRACOES em db.ts: `...MIGRACOES_MOTOR`.
 * Segue as entidades do vault (Task, Carta da Task, Conexão da Task, Evento da Task) e acrescenta
 * colunas de execução (estado, tarefa, entrega, voltas). Depende das tabelas `projeto` e `carta`.
 * Artefato (cartas de apoio) fica para a E5; monitor_id sem FK até a E6 criar `monitor`.
 */
export const MIGRACOES_MOTOR: string[] = [
  `
  CREATE TABLE task (
    id                      TEXT PRIMARY KEY,
    numero                  INTEGER NOT NULL UNIQUE,
    projeto_id              TEXT NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    monitor_id              TEXT,
    task_original_id        TEXT REFERENCES task(id) ON DELETE SET NULL,
    referencia              TEXT,
    titulo                  TEXT,
    missao                  TEXT NOT NULL,
    ajustes                 TEXT NOT NULL DEFAULT '',
    situacao                TEXT NOT NULL,
    branch                  TEXT,
    worktree                TEXT,
    voltas                  INTEGER NOT NULL DEFAULT 0,
    tokens                  INTEGER NOT NULL DEFAULT 0,
    alerta_orcamento        INTEGER NOT NULL DEFAULT 0,
    decisao_motivo          TEXT,
    decisao_carta_id        TEXT,
    decisao_questionador_id TEXT,
    criada_em               INTEGER NOT NULL,
    iniciada_em             INTEGER,
    encerrada_em            INTEGER
  );
  CREATE INDEX task_1 ON task (projeto_id, situacao);
  CREATE TABLE task_carta (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    carta_id    TEXT NOT NULL REFERENCES carta(id) ON DELETE RESTRICT,
    retirada    INTEGER NOT NULL DEFAULT 0,
    comeca      INTEGER NOT NULL DEFAULT 0,
    concluida   INTEGER NOT NULL DEFAULT 0,
    copia_carta TEXT,
    estado      TEXT NOT NULL DEFAULT 'espera',
    atividade   TEXT NOT NULL DEFAULT '',
    tarefa      TEXT,
    entrega     TEXT,
    voltas      INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX task_carta_1 ON task_carta (task_id, carta_id);
  CREATE TABLE task_conexao (
    id            TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    de_carta_id   TEXT NOT NULL,
    para_carta_id TEXT NOT NULL,
    tipo          TEXT NOT NULL,
    ordem         INTEGER NOT NULL,
    skills        TEXT
  );
  CREATE TABLE evento_task (
    id            TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    tipo          TEXT NOT NULL,
    de_carta_id   TEXT,
    para_carta_id TEXT,
    texto         TEXT NOT NULL,
    tokens        INTEGER,
    criado_em     INTEGER NOT NULL
  );
  CREATE INDEX evento_task_1 ON evento_task (task_id, criado_em);
  `,
  // E4: ordem de chegada na fila e devoluções pendentes de cada carta (a retomada ao abrir o app lê isto).
  `
  ALTER TABLE task ADD COLUMN fila_em INTEGER;
  ALTER TABLE task_carta ADD COLUMN apontamentos TEXT;
  `,
]
