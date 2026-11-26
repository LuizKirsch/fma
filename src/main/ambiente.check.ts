// Self-check do ambiente: node --experimental-strip-types src/main/ambiente.check.ts
import assert from "node:assert/strict"
import { aspas, comando, deCaminho, juntar, mascarar, paraFs } from "./ambiente.ts"

assert.deepEqual(deCaminho("\\\\wsl.localhost\\Ubuntu-24.04\\home\\x\\repo"), { ambiente: "wsl:Ubuntu-24.04", caminho: "/home/x/repo" })
assert.deepEqual(deCaminho("\\\\wsl$\\Debian\\"), { ambiente: "wsl:Debian", caminho: "/" })
assert.deepEqual(deCaminho("\\\\WSL.LOCALHOST\\U\\a"), { ambiente: "wsl:U", caminho: "/a" })
assert.deepEqual(deCaminho("C:\\projetos\\x"), { ambiente: "local", caminho: "C:\\projetos\\x" })
assert.deepEqual(deCaminho("\\\\servidor\\pasta"), { ambiente: "local", caminho: "\\\\servidor\\pasta" })
assert.deepEqual(deCaminho("/home/x"), { ambiente: "local", caminho: "/home/x" })

assert.equal(paraFs("wsl:U", "/home/x"), "\\\\wsl.localhost\\U\\home\\x")
assert.equal(paraFs("local", "C:\\a"), "C:\\a")
assert.equal(juntar("wsl:U", "/a", "b", "c"), "/a/b/c")

// Aspas simples: o texto sai inteiro, qualquer que seja o conteúdo.
assert.equal(aspas("it's"), "'it'\\''s'")
assert.equal(aspas(`a "b" $HOME \`x\``), "'a \"b\" $HOME `x`'")
const w = comando("wsl:U", "claude", ["-p", "--model", "o'brien"], { cwd: "/home/x/repo", env: { CLAUDE_CONFIG_DIR: "/home/x/.fma/contas/1", T: "a b" } })
assert.equal(w.comando, "wsl.exe")
assert.deepEqual(w.args.slice(0, 7), ["-d", "U", "--cd", "/home/x/repo", "-e", "bash", "-lc"])
assert.equal(w.args[7], "CLAUDE_CONFIG_DIR='/home/x/.fma/contas/1' T='a b' 'claude' '-p' '--model' 'o'\\''brien'")
assert.equal(w.cwd, undefined)

const l = comando("local", "git", ["status"], { cwd: "/tmp" })
assert.deepEqual([l.comando, l.args, l.cwd, l.shell], ["git", ["status"], "/tmp", false])
assert.equal(mascarar("task-manager-for-this-project-name-long"), "task-manager-for-this-project-name-long")
assert.equal(mascarar("x ghp_" + "a1".repeat(18) + " y"), "x *** y")
assert.equal(mascarar("Senha: abc123"), "Senha: ***")
assert.equal(mascarar("ClientSecret = xyz"), "ClientSecret = ***")
assert.equal(mascarar('{"api_key": "k1"}'), '{"api_key": ***')
assert.equal(mascarar("Ajustar a tela de senha do cadastro e o token de acesso"), "Ajustar a tela de senha do cadastro e o token de acesso")
console.log("ambiente.check: ok")
