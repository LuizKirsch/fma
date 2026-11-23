/**
 * Interface do Tako. Ainda sem nenhuma tela de verdade: só confirma que a
 * janela, o preload e o TypeScript estão ligados, mostrando sistema e versões.
 */
const names: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };

const { platform, versions } = window.tako;
const info = document.getElementById("info");

if (info) {
  info.textContent =
    `${names[platform] ?? platform} · Electron ${versions.electron} · ` +
    `Chromium ${versions.chrome} · Node ${versions.node}`;
}

export {};
