import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compararPorRetencao, diasDesdeUltima, motivoDoBloco, retencao } from '../js/core/retencao.js';
import { carregarFixture } from './carregar-fixture.js';

const fixture = carregarFixture('retencao.json');

describe('C: retencao', () => {
  const { tolerancia, casos } = fixture.retencao;
  for (const { t, S, esperado, nota } of casos) {
    test(`retencao(${t}, ${S})${nota ? ` — ${nota}` : ''}`, () => {
      assert.ok(Math.abs(retencao(t, S) - esperado) < tolerancia, `${retencao(t, S)} ≠ ${esperado}`);
    });
  }

  test('retencao(3, 0) é exatamente retencao(3, 1)', () => {
    assert.equal(retencao(3, 0), retencao(3, 1));
  });
});

describe('C: diasDesdeUltima', () => {
  test('conta os dias de ultimaRevisao até a data', () => {
    assert.equal(diasDesdeUltima({ ultimaRevisao: '2026-11-09' }, '2026-11-12'), 3);
    assert.equal(diasDesdeUltima({ ultimaRevisao: '2026-10-30' }, '2026-11-02'), 3);
  });

  test('sem conclusão (estado null ou ultimaRevisao null) lança RangeError', () => {
    assert.throws(() => diasDesdeUltima(null, '2026-11-12'), RangeError);
    assert.throws(() => diasDesdeUltima({ ultimaRevisao: null }, '2026-11-12'), RangeError);
  });
});

describe('C: compararPorRetencao', () => {
  test(fixture.ordenacao.descricao, () => {
    const ordenado = [...fixture.ordenacao.entrada].sort(compararPorRetencao).map((x) => x.id);
    assert.deepEqual(ordenado, fixture.ordenacao.esperado);
  });

  test('a ordem inteira concorda com a retenção em float', () => {
    const entrada = fixture.ordenacao.entrada;
    const porFloat = [...entrada]
      .sort((a, b) => retencao(a.diasDesdeUltima, a.intervalo) - retencao(b.diasDesdeUltima, b.intervalo))
      .map((x) => x.id);
    assert.deepEqual(porFloat, fixture.ordenacao.esperado);
  });

  test('empate devolve 0 para quem chama encadear o próximo critério', () => {
    // 2/4 e 3/6 são a mesma fração.
    assert.equal(compararPorRetencao({ diasDesdeUltima: 2, intervalo: 4 }, { diasDesdeUltima: 3, intervalo: 6 }), 0);
  });

  test('intervalo 0 conta como 1', () => {
    assert.equal(compararPorRetencao({ diasDesdeUltima: 3, intervalo: 0 }, { diasDesdeUltima: 3, intervalo: 1 }), 0);
  });
});

describe('C: motivoDoBloco', () => {
  for (const caso of fixture.motivoDoBloco) {
    test(caso.nome, () => {
      assert.equal(motivoDoBloco(caso.bloco, caso.topico, caso.estado), caso.esperado);
    });
  }

  test('nenhuma frase tem ponto final ou exclamação', () => {
    for (const caso of fixture.motivoDoBloco) {
      assert.match(caso.esperado, /[^.!]$/);
    }
  });

  test('revisão comum sem estado ou tipo desconhecido lança RangeError', () => {
    const topico = { id: 'js', nome: 'JavaScript', peso: 5, dominio: 1 };
    assert.throws(() => motivoDoBloco({ data: '2026-11-12', tipo: 'REVISAO' }, topico, null), RangeError);
    assert.throws(() => motivoDoBloco({ data: '2026-11-12', tipo: 'OUTRO' }, topico, null), RangeError);
  });
});
