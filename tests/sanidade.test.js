import { test } from 'node:test';
import assert from 'node:assert/strict';

// Só confirma que o runner nativo encontra e executa os testes desta pasta.
test('o runner de testes está funcionando', () => {
  assert.equal(1 + 1, 2);
});
