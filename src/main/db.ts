/**
 * Banco local do FMA: SQLite pelo módulo `node:sqlite`, que já vem no Node do Electron
 * (nada nativo para compilar no Windows, no macOS ou no Linux).
 * O arquivo fica na pasta de dados do app (ex.: %APPDATA%/FMA/fma.db no Windows).
 *
 * Migrações: cada item de MIGRACOES roda uma vez, na ordem; o número da última aplicada
 * fica em `PRAGMA user_version`. Para mudar o banco, acrescente um item no fim, nunca edite um antigo.
 */
import { DatabaseSync } from "node:sqlite"
import { join } from "node:path"
import { app } from "electron"
import { MIGRACOES_MOTOR } from "./motor/migracoes"
import { MIGRACOES_APOIO } from "./apoio/migracoes"
import { MIGRACOES_MAESTRO } from "./maestro/migracoes"
import { MIGRACOES_MONITOR } from "./monitores/migracoes"

const MIGRACOES: string[] = [
  // 1: coleção de cartas (módulo 1). Métodos e skills guardam a chave "<classe>:<id>" do catálogo.
  `
  CREATE TABLE carta (
    id             TEXT PRIMARY KEY,
    nome           TEXT NOT NULL,
    classe         TEXT NOT NULL,
    simbolo        TEXT NOT NULL,
    cor            TEXT NOT NULL,
    descricao      TEXT NOT NULL DEFAULT '',
    cli            TEXT NOT NULL,
    modelo         TEXT NOT NULL,
    prompt         TEXT NOT NULL,
    prompt_editado INTEGER NOT NULL DEFAULT 0,
    criada_em      INTEGER NOT NULL,
    atualizada_em  INTEGER NOT NULL
  );
  CREATE TABLE carta_metodo (
    carta_id TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    chave    TEXT NOT NULL,
    ordem    INTEGER NOT NULL,
    PRIMARY KEY (carta_id, chave)
  );
  CREATE TABLE carta_skill (
    carta_id TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    chave    TEXT NOT NULL,
    ordem    INTEGER NOT NULL,
    PRIMARY KEY (carta_id, chave)
  );
  CREATE TABLE prompt_adicional (
    id       TEXT PRIMARY KEY,
    carta_id TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    titulo   TEXT NOT NULL DEFAULT '',
    texto    TEXT NOT NULL DEFAULT '',
    ativo    INTEGER NOT NULL DEFAULT 1,
    ordem    INTEGER NOT NULL
  );
  CREATE TABLE configuracao (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
  // 2: projetos e mesa (módulos 2 e 3). Habilidades da conexão guardam a chave de SKILLS_CONEXAO (shared/mesa.ts).
  // conexao.curva_x/y: quanto a linha foi puxada a partir do meio da reta (nulo = reta).
  `
  CREATE TABLE projeto (
    id                 TEXT PRIMARY KEY,
    nome               TEXT NOT NULL,
    repositorio        TEXT NOT NULL,
    branch_base        TEXT NOT NULL,
    ordem              INTEGER NOT NULL,
    vagas              INTEGER NOT NULL DEFAULT 2,
    limite_devolucoes  INTEGER NOT NULL DEFAULT 2,
    limite_tokens      INTEGER NOT NULL DEFAULT 20000,
    conexoes_visiveis  INTEGER NOT NULL DEFAULT 1,
    mostrar_sugestoes  INTEGER NOT NULL DEFAULT 1,
    vista              TEXT,
    criado_em          INTEGER NOT NULL
  );
  CREATE TABLE carta_mesa (
    id         TEXT PRIMARY KEY,
    projeto_id TEXT NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    carta_id   TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    x          INTEGER NOT NULL,
    y          INTEGER NOT NULL,
    UNIQUE (projeto_id, carta_id)
  );
  CREATE TABLE conexao (
    id            TEXT PRIMARY KEY,
    projeto_id    TEXT NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    de_carta_id   TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    para_carta_id TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    tipo          TEXT NOT NULL CHECK (tipo IN ('entrega', 'questiona')),
    ordem         INTEGER NOT NULL,
    curva_x       INTEGER,
    curva_y       INTEGER,
    UNIQUE (projeto_id, de_carta_id, para_carta_id)
  );
  CREATE TABLE conexao_skill (
    conexao_id TEXT NOT NULL REFERENCES conexao(id) ON DELETE CASCADE,
    chave      TEXT NOT NULL,
    ordem      INTEGER NOT NULL,
    PRIMARY KEY (conexao_id, chave)
  );
  `,
  // 3 em diante: tabelas dos outros módulos (cada pasta guarda as suas migrações; a ordem aqui é a do banco).
  // ATENÇÃO: estes arrays estão congelados. Acrescentar item em qualquer um que não seja o último desloca os
  // índices e quebra bancos existentes. Migração nova vai num item novo no FIM desta lista, nunca dentro deles.
  ...MIGRACOES_MOTOR,
  ...MIGRACOES_APOIO,
  ...MIGRACOES_MAESTRO,
  ...MIGRACOES_MONITOR,
  // 8: protótipo v16 (E10). Tabelas de todos os pacotes numa migração só; tipos em src/shared/{conta,biblioteca,fonte}.ts.
  `
  CREATE TABLE conta (
    id           TEXT PRIMARY KEY,
    cli          TEXT NOT NULL,             -- claude | codex | gemini
    nome         TEXT NOT NULL,             -- rótulo livre (ex.: e-mail da conta)
    pasta_config TEXT,                      -- CLAUDE_CONFIG_DIR / CODEX_HOME / GEMINI home; null = padrão da CLI
    padrao       INTEGER NOT NULL DEFAULT 0, -- uma padrão por CLI
    criada_em    INTEGER NOT NULL
  );
  ALTER TABLE carta ADD COLUMN conta_id TEXT REFERENCES conta(id) ON DELETE SET NULL;
  ALTER TABLE carta ADD COLUMN esforco TEXT NOT NULL DEFAULT 'alto';
  ALTER TABLE carta ADD COLUMN loja_origem TEXT;   -- JSON {lojaId, autor, travada} quando veio da Loja
  ALTER TABLE task ADD COLUMN conta_tokens TEXT;   -- JSON {contaId: tokens} para o uso por conta

  CREATE TABLE biblioteca_item (
    id        TEXT PRIMARY KEY,
    tipo      TEXT NOT NULL,                -- habilidade | memoria
    nome      TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    texto     TEXT NOT NULL,
    padrao    INTEGER NOT NULL DEFAULT 0,   -- 1 = vem com o app, não pode ser excluído
    criado_em INTEGER NOT NULL
  );
  CREATE TABLE carta_biblioteca (
    carta_id TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    item_id  TEXT NOT NULL REFERENCES biblioteca_item(id) ON DELETE CASCADE,
    ordem    INTEGER NOT NULL,
    PRIMARY KEY (carta_id, item_id)
  );
  CREATE TABLE loja_agente (
    id           TEXT PRIMARY KEY,
    carta_json   TEXT NOT NULL,             -- cópia da carta publicada
    autor        TEXT NOT NULL,
    descricao    TEXT NOT NULL DEFAULT '',
    categoria    TEXT NOT NULL DEFAULT '',
    verificado   INTEGER NOT NULL DEFAULT 0,
    meu          INTEGER NOT NULL DEFAULT 0, -- publicado por você
    instalacoes  INTEGER NOT NULL DEFAULT 0,
    publicado_em INTEGER NOT NULL
  );

  CREATE TABLE fonte (
    id           TEXT PRIMARY KEY,
    tipo         TEXT NOT NULL,             -- github | jira | azure | lupito
    rotulo       TEXT NOT NULL,
    config       TEXT NOT NULL DEFAULT '{}', -- JSON: servidor MCP, organização etc.
    conectada_em INTEGER NOT NULL
  );
  ALTER TABLE projeto ADD COLUMN contexto TEXT NOT NULL DEFAULT '';
  ALTER TABLE projeto ADD COLUMN fonte_id TEXT REFERENCES fonte(id) ON DELETE SET NULL;
  ALTER TABLE projeto ADD COLUMN fonte_projeto TEXT;  -- JSON {id, titulo} do projeto na fonte
  ALTER TABLE task ADD COLUMN contexto TEXT NOT NULL DEFAULT '';

  CREATE TABLE conversa_direta (
    id        TEXT PRIMARY KEY,
    carta_id  TEXT NOT NULL REFERENCES carta(id) ON DELETE CASCADE,
    task_id   TEXT REFERENCES task(id) ON DELETE SET NULL,
    de        TEXT NOT NULL,                -- voce | carta
    texto     TEXT NOT NULL,
    criada_em INTEGER NOT NULL
  );
  `,
  // 9: ambiente (RF 2.37): "local" ou "wsl:<distro>", do projeto e da conta.
  `
  ALTER TABLE projeto ADD COLUMN ambiente TEXT NOT NULL DEFAULT 'local';
  ALTER TABLE conta ADD COLUMN ambiente TEXT NOT NULL DEFAULT 'local';
  `,
  // 10: comandos que as cartas podem rodar sem pedir (JSON de padrões tipo "npm *"); null = COMANDOS_PADRAO.
  `
  ALTER TABLE projeto ADD COLUMN comandos TEXT;
  `,
  // 11: perfis Jira/Azure removidos (sem servidor real para validar): somem as fontes desses tipos e os monitores delas.
  `
  DELETE FROM monitor WHERE conector IN (SELECT 'fonte:' || id FROM fonte WHERE tipo IN ('jira','azure'));
  DELETE FROM fonte WHERE tipo IN ('jira','azure');
  `,
  `
  ALTER TABLE task ADD COLUMN pr_url TEXT;
  `,
  // Limite de tokens padrão 20k era baixo demais (task trivial gasta 20-75k): novos e os que estavam no padrão vão para 150k.
  `
  UPDATE projeto SET limite_tokens = 150000 WHERE limite_tokens = 20000;
  `,
  `
  ALTER TABLE task ADD COLUMN card TEXT;
  `,
  // Decisões do usuário (valem para todas as cartas da task) e pastas do repositório ligadas no worktree (JSON; null = padrão).
  `
  ALTER TABLE task ADD COLUMN decisoes TEXT NOT NULL DEFAULT '';
  ALTER TABLE projeto ADD COLUMN pastas_compartilhadas TEXT;
  `,
  // Sessão da CLI por (task, carta): JSON {id, cwd}, para retomar em vez de reler o repositório.
  `
  ALTER TABLE task_carta ADD COLUMN sessao TEXT;
  `,
  // Próxima migração: item novo AQUI no fim.
]

let db: DatabaseSync | undefined

/** Abre o banco (uma vez) e aplica as migrações que faltam. */
export function abrirBanco(caminho = join(app.getPath("userData"), "fma.db")): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(caminho)
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
  const atual = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version)
  for (let i = atual; i < MIGRACOES.length; i++) {
    transacao(db, () => {
      db!.exec(MIGRACOES[i])
      db!.exec(`PRAGMA user_version = ${i + 1}`)
    })
  }
  return db
}

/** Roda `fn` numa transação: ou grava tudo, ou nada. */
export function transacao<T>(banco: DatabaseSync, fn: () => T): T {
  banco.exec("BEGIN")
  try {
    const r = fn()
    banco.exec("COMMIT")
    return r
  } catch (e) {
    banco.exec("ROLLBACK")
    throw e
  }
}

export function fecharBanco() {
  db?.close()
  db = undefined
}
