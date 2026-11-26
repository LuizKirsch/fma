// Publica uma versão nova no GitHub Releases; o FMA instalado se atualiza sozinho.
// Uso: npm run release            (sobe o patch: 0.1.0 -> 0.1.1)
//      npm run release -- minor   (0.1.0 -> 0.2.0)
// Precisa: árvore git limpa e `gh` logado (o token do gh é usado só para publicar).
import { execSync } from "node:child_process"

const rodar = (cmd, env) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } })
const nivel = process.argv[2] ?? "patch"

if (execSync("git status --porcelain").toString().trim()) {
  console.error("Commite ou guarde as mudanças antes de publicar.")
  process.exit(1)
}
rodar(`npm version ${nivel} -m "release: v%s"`) // commit + tag da versão
const GH_TOKEN = execSync("gh auth token").toString().trim()
rodar("git push --follow-tags") // a tag tem que estar no GitHub antes: release publicado exige tag válida
// Cria o release antes: o electron-builder envia os arquivos em paralelo e, sem release, cada envio criava um (duplicados).
const versao = JSON.parse(execSync("node -p \"JSON.stringify(require('./package.json').version)\"").toString())
rodar(`gh release create v${versao} --title v${versao} --notes "FMA ${versao}" --verify-tag`)
rodar("npm run build && npx electron-builder --win --publish always", { GH_TOKEN })
