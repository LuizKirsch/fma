// Apaga a pasta dist/ antes de compilar, pra não sobrar arquivo velho.
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
