// Roda a suíte em vários fusos para pegar bugs de data que só aparecem fora de UTC.
// Fica em Node, e não em `TZ=... node` no package.json, porque o npm no Windows
// usa o cmd.exe, que não entende essa sintaxe.
import { spawnSync } from 'node:child_process';

const FUSOS = ['America/Sao_Paulo', 'Asia/Tokyo', 'UTC'];

for (const fuso of FUSOS) {
  console.log(`\n=== TZ=${fuso} ===`);
  const resultado = spawnSync(
    process.execPath,
    ['--test', 'tests/**/*.test.js'],
    { stdio: 'inherit', env: { ...process.env, TZ: fuso } },
  );
  if (resultado.status !== 0) {
    console.error(`\nFalhou com TZ=${fuso}.`);
    process.exit(resultado.status ?? 1);
  }
}
