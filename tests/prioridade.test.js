import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  prioridade,
  demandaMinima,
  demanda,
  ordenarPorPrioridade,
} from '../js/core/prioridade.js';
import { carregarFixture } from './carregar-fixture.js';

describe('prioridade', () => {
  test('peso × (6 − dominio)', () => {
    assert.equal(prioridade({ peso: 3, dominio: 2 }), 12);
  });

  test('vai de 1 a 25', () => {
    assert.equal(prioridade({ peso: 1, dominio: 5 }), 1);
    assert.equal(prioridade({ peso: 5, dominio: 1 }), 25);
  });

  for (const invalido of [0, 6, 2.5, -1, '3', null, undefined, NaN]) {
    test(`peso ${String(invalido)} lança RangeError`, () => {
      assert.throws(() => prioridade({ peso: invalido, dominio: 3 }), RangeError);
    });
    test(`dominio ${String(invalido)} lança RangeError`, () => {
      assert.throws(() => prioridade({ peso: 3, dominio: invalido }), RangeError);
    });
  }
});

describe('demandaMinima', () => {
  test('6 − dominio, de 1 a 5', () => {
    assert.equal(demandaMinima({ dominio: 1 }), 5);
    assert.equal(demandaMinima({ dominio: 3 }), 3);
    assert.equal(demandaMinima({ dominio: 5 }), 1);
  });

  for (const invalido of [0, 6, 2.5]) {
    test(`dominio ${invalido} lança RangeError`, () => {
      assert.throws(() => demandaMinima({ dominio: invalido }), RangeError);
    });
  }
});

describe('demanda', () => {
  test('tópico manual usa blocosDesejados', () => {
    assert.equal(demanda({ peso: 3, dominio: 2, blocosDesejados: 7 }), 7);
    assert.equal(demanda({ peso: 3, dominio: 2, blocosDesejados: 1 }), 1);
  });

  test('sem blocosDesejados válido, usa demandaMinima', () => {
    for (const blocosDesejados of [undefined, null, 0, -2, 2.5, '7']) {
      assert.equal(demanda({ peso: 3, dominio: 2, blocosDesejados }), 4, String(blocosDesejados));
    }
  });

  test('tópico automático ainda valida o domínio', () => {
    assert.throws(() => demanda({ peso: 3, dominio: 6 }), RangeError);
  });
});

describe('ordenarPorPrioridade', () => {
  const { casos } = carregarFixture('prioridade-ordem-canonica.json');

  for (const caso of casos) {
    test(caso.nome, () => {
      for (const topico of caso.entrada) {
        assert.equal(prioridade(topico), caso.prioridades[topico.id], topico.id);
      }
      const ids = ordenarPorPrioridade(caso.entrada).map((t) => t.id);
      assert.deepEqual(ids, caso.esperado);
    });
  }

  test('não muta a entrada e devolve os mesmos objetos', () => {
    const entrada = [
      { id: 'a', peso: 1, dominio: 5 },
      { id: 'b', peso: 5, dominio: 1 },
    ];
    const copia = structuredClone(entrada);
    const ordenado = ordenarPorPrioridade(entrada);

    assert.deepEqual(entrada, copia);
    assert.notEqual(ordenado, entrada);
    assert.equal(ordenado[0], entrada[1]);
  });

  test('lista vazia', () => {
    assert.deepEqual(ordenarPorPrioridade([]), []);
  });

  test('tópico inválido lança RangeError', () => {
    assert.throws(() => ordenarPorPrioridade([{ id: 'a', peso: 0, dominio: 3 }]), RangeError);
  });
});
