import { readFileSync } from 'node:fs';

// As fixtures ficam em JSON para que o porte em Java (fase 2) rode exatamente os mesmos casos.
export function carregarFixture(nome) {
  const url = new URL(`./fixtures/${nome}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}
