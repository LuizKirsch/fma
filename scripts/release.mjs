// Publica uma versão nova no GitHub Releases; o FMA instalado se atualiza sozinho.
// Uso: npm run release            (sobe o patch: 0.1.0 -> 0.1.1)
//      npm run release -- minor   (0.1.0 -> 0.2.0)
// Precisa: árvore git limpa e `gh` logado (o token do gh é usado só para publicar).
import { execSync } from "node:child_process"
import { existsSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const MANTER_NO_GITHUB = 3 // releases mais recentes que ficam (o auto-update só usa a última; as outras servem para voltar versão)

const rodar = (cmd, env) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } })
const nivel = process.argv[2] ?? "patch"

if (execSync("git status --porcelain").toString().trim()) {
  console.error("Commite ou guarde as mudanças antes de publicar.")
  process.exit(1)
}
// Instaladores das versões anteriores na pasta release/ (~120 MB cada): só o da versão nova fica.
if (existsSync("release"))
  for (const f of readdirSync("release", { withFileTypes: true }).filter((f) => f.isFile() && /^FMA Setup .*\.exe(\.blockmap)?$/.test(f.name)))
    rmSync(join("release", f.name))
rodar(`npm version ${nivel} -m "release: v%s"`) // commit + tag da versão
const GH_TOKEN = execSync("gh auth token").toString().trim()
rodar("git push --follow-tags") // a tag tem que estar no GitHub antes: release publicado exige tag válida
// Cria o release antes: o electron-builder envia os arquivos em paralelo e, sem release, cada envio criava um (duplicados).
const versao = JSON.parse(execSync("node -p \"JSON.stringify(require('./package.json').version)\"").toString())
rodar(`gh release create v${versao} --title v${versao} --notes "FMA ${versao}" --verify-tag`)
rodar("npm run build && npx electron-builder --win --publish always", { GH_TOKEN })

// Releases antigos no GitHub: ficam só os mais recentes (as tags continuam no git).
const tags = execSync(`gh release list --limit 100 --json tagName --jq ".[].tagName"`).toString().trim().split(/\r?\n/).filter(Boolean)
for (const tag of tags.slice(MANTER_NO_GITHUB)) rodar(`gh release delete ${tag} --yes`)
