/**
 * Preload: a ponte entre a interface e o núcleo.
 *
 * Roda antes da página carregar e expõe pra interface só o que for liberado
 * aqui, em `window.tako`. Tudo que a interface precisar do sistema vai passar
 * por esta ponte. Por enquanto ela só informa o sistema e as versões.
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("tako", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
