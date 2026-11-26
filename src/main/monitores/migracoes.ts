/**
 * Migrações dos monitores. Quem monta o banco (db.ts) acrescenta `...MIGRACOES_MONITOR` ao fim de MIGRACOES.
 * Sem FOREIGN KEY para projeto/carta/task (tabelas de outros módulos): excluir o monitor apaga só as linhas daqui,
 * as tasks que ele criou continuam (RN 56).
 */
export const MIGRACOES_MONITOR: string[] = [
  `
  CREATE TABLE monitor (
    id                 TEXT PRIMARY KEY,
    projeto_id         TEXT NOT NULL,
    nome               TEXT NOT NULL,
    conector           TEXT NOT NULL,
    consulta           TEXT NOT NULL,
    intervalo_min      INTEGER NOT NULL DEFAULT 5,
    ativo              INTEGER NOT NULL DEFAULT 1,
    inicio_automatico  INTEGER NOT NULL DEFAULT 0,
    carta_inicial_id   TEXT,
    coluna_inicio      TEXT NOT NULL DEFAULT '',
    coluna_conclusao   TEXT NOT NULL DEFAULT '',
    coluna_trava       TEXT NOT NULL DEFAULT '',
    comentar_ao_travar INTEGER NOT NULL DEFAULT 0,
    coluna_retomada    TEXT NOT NULL DEFAULT '',
    ultima_checagem    INTEGER,
    proxima_checagem   INTEGER,
    ultimo_resultado   TEXT NOT NULL DEFAULT '',
    total_criadas      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX monitor_projeto ON monitor(projeto_id);
  CREATE TABLE monitor_visto (
    monitor_id TEXT NOT NULL REFERENCES monitor(id) ON DELETE CASCADE,
    ref        TEXT NOT NULL,
    task_id    TEXT,
    estado     TEXT NOT NULL DEFAULT 'criada',
    titulo     TEXT NOT NULL DEFAULT '',
    criado_em  INTEGER NOT NULL,
    PRIMARY KEY (monitor_id, ref)
  );
  CREATE INDEX monitor_visto_task ON monitor_visto(task_id);
  `,
]
