import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarViabilidade } from '../js/core/viabilidade.js';
import { calcularCapacidade } from '../js/core/capacidade.js';
import { carregarFixture } from './carregar-fixture.js';

describe('avaliarViabilidade', () => {
  for (const nome of ['viabilidade-inviavel.json', 'viabilidade-viavel.json']) {
    test(nome, () => {
      const { entrada, esperado } = carregarFixture(nome);
      assert.deepEqual(avaliarViabilidade(entrada), esperado);
    });
  }

  describe('viabilidade-bloqueante.json (R16)', () => {
    const { casos } = carregarFixture('viabilidade-bloqueante.json');
    for (const { nome, entrada, capacidade, esperado } of casos) {
      test(nome, () => {
        const c = calcularCapacidade(entrada.plano);
        assert.equal(c.capacidadeTotal, capacidade.capacidadeTotal);
        assert.equal(c.capacidadeEstudo, capacidade.capacidadeEstudo);
        assert.deepEqual(avaliarViabilidade(entrada), esperado);
      });
    }
  });

  // Plano curto e reaproveitável: seg 09/11 a qua 11/11, 2 blocos por dia, 6 no total, 4 de estudo.
  const planoCurto = {
    inicio: '2026-11-09',
    fim: '2026-11-11',
    disponibilidade: { 1: 60, 2: 60, 3: 60 },
  };

  test('tópico manual entra na demanda com blocosDesejados', () => {
    const { entrada } = carregarFixture('viabilidade-viavel.json');
    const topicos = [...entrada.topicos, { id: 'm', nome: 'M', peso: 1, dominio: 5, blocosDesejados: 6 }];
    const r = avaliarViabilidade({ plano: entrada.plano, topicos });
    // 5 + 4 dos automáticos + 6 do manual, e não + 1 (a demanda mínima de domínio 5).
    assert.equal(r.demandaTotal, 15);
    assert.equal(r.deficit, 1);
    assert.deepEqual(r.escapatorias.reduzirDemanda.topicos.at(-1), { id: 'm', antes: 6, depois: 5 });
  });

  test('sem nenhum dia disponível, maisTempo não acha resposta e termina', () => {
    const r = avaliarViabilidade({
      plano: { ...planoCurto, disponibilidade: {} },
      topicos: [{ id: 'a', nome: 'A', peso: 3, dominio: 3 }],
    });
    assert.equal(r.capacidadeEstudo, 0);
    assert.deepEqual(r.escapatorias.maisTempo, { minutosPorDia: null, diasAMais: null, novoFim: null });
  });

  test('com dataAvaliacao, estender o fim não é opção', () => {
    const r = avaliarViabilidade({
      plano: { ...planoCurto, dataAvaliacao: '2026-11-10' },
      topicos: [{ id: 'a', nome: 'A', peso: 3, dominio: 1 }],
    });
    // Janela 09–10/11: 4 blocos, 3 de estudo, para 5 de demanda.
    assert.equal(r.capacidadeEstudo, 3);
    assert.equal(r.escapatorias.maisTempo.diasAMais, null);
    assert.equal(r.escapatorias.maisTempo.novoFim, null);
    // Mais minutos ainda funciona: +60 leva seg e ter a 4 blocos, 8 no total e 6 de estudo.
    assert.equal(r.escapatorias.maisTempo.minutosPorDia, 60);
  });

  test('reduzirDemanda não fecha o déficit quando todos os tópicos já estão em 1', () => {
    const topicos = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, nome: id, peso: 3, dominio: 2 }));
    const r = avaliarViabilidade({ plano: planoCurto, topicos });
    assert.equal(r.capacidadeEstudo, 4);
    assert.equal(r.escapatorias.reduzirDemanda.suficiente, false);
    assert.ok(r.escapatorias.reduzirDemanda.topicos.every((t) => t.depois === 1));
  });

  test('o empate de prioridade no corte segue a ordem de cadastro', () => {
    // Mesma prioridade: o último cadastrado é o "menor" e perde blocos primeiro.
    const topicos = [
      { id: 'p', nome: 'P', peso: 2, dominio: 3 },
      { id: 'q', nome: 'Q', peso: 2, dominio: 3 },
    ];
    const r = avaliarViabilidade({ plano: { ...planoCurto, fim: '2026-11-10' }, topicos });
    // 4 blocos, 3 de estudo, 6 de demanda: q cai a 1 (−2) e p perde 1.
    assert.deepEqual(r.escapatorias.reduzirDemanda.topicos, [
      { id: 'p', antes: 3, depois: 2 },
      { id: 'q', antes: 3, depois: 1 },
    ]);
    assert.deepEqual(r.escapatorias.removerTopicos, { removidos: ['q'], demandaRestante: 3 });
  });

  test('sem tópicos: viável, cobertura 100% e sem bloqueio', () => {
    const r = avaliarViabilidade({ plano: planoCurto, topicos: [] });
    assert.equal(r.viavel, true);
    assert.equal(r.bloqueante, false);
    assert.equal(r.demandaTotal, 0);
    assert.deepEqual(r.cobertura, { percentual: 100 });
    assert.equal(r.escapatorias, null);
  });

  test('aceita avaliação antes do início (replanejamento depois da prova)', () => {
    const r = avaliarViabilidade({
      plano: { ...planoCurto, dataAvaliacao: '2026-11-06' },
      topicos: [{ id: 'a', nome: 'A', peso: 3, dominio: 3 }],
    });
    assert.equal(r.capacidadeEstudo, 0);
    assert.equal(r.bloqueante, true);
    assert.equal(r.escapatorias.maisTempo.minutosPorDia, null);
  });

  test('não muta a entrada', () => {
    const { entrada } = carregarFixture('viabilidade-inviavel.json');
    const copia = structuredClone(entrada);
    avaliarViabilidade(entrada);
    assert.deepEqual(entrada, copia);
  });
});
