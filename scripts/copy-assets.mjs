// Copia os arquivos da interface que não são TypeScript (HTML, CSS) para dist/.
// Em Node puro pra funcionar igual no Windows, no macOS e no Linux.
import { cpSync } from "node:fs";

for (const file of ["index.html", "styles.css"]) {
  cpSync(`src/renderer/${file}`, `dist/renderer/${file}`);
}
