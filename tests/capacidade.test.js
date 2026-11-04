import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { blocosNoDia, calcularCapacidade, MINIMO_BLOCO_MIN } from '../js/core/capacidade.js';
import { diferencaEmDias } from '../js/util/datas.js';
import { carregarFixture } from './carregar-fixture.js';

describe('blocosNoDia', () => {
  const { casos } = carregarFixture('blocos-no-dia.json');

  for (const { minutos, duracaoBlocoMin, esperado } of casos) {
    const rotulo = duracaoBlocoMin === undefined ? `${minutos}` : `(${minutos}, ${duracaoBlocoMin})`;
    test(`${rotulo} → [${esperado}]`, () => {
      const blocos = duracaoBlocoMin === undefined
        ? blocosNoDia(minutos)
        : blocosNoDia(minutos, duracaoBlocoMin);
      assert.deepEqual(blocos, esperado);
    });
  }

  test('o mínimo de bloco é 15 minutos', () => {
    assert.equal(MINIMO_BLOCO_MIN, 15);
  });

  test('minutos negativos ou não inteiros lançam RangeError', () => {
    assert.throws(() => blocosNoDia(-1), RangeError);
    assert.throws(() => blocosNoDia(30.5), RangeError);
    assert.throws(() => blocosNoDia('60'), RangeError);
  });

  test('duração de bloco abaixo do mínimo lança RangeError', () => {
    assert.throws(() => blocosNoDia(60, 0), RangeError);
    assert.throws(() => blocosNoDia(60, 14), RangeError);
    assert.throws(() => blocosNoDia(60, 22.5), RangeError);
  });
});

describe('calcularCapacidade', () => {
  for (const nome of ['capacidade-duas-semanas.json', 'capacidade-com-avaliacao.json']) {
    test(nome, () => {
      const { entrada, esperado } = carregarFixture(nome);
      assert.deepEqual(calcularCapacidade(entrada), esperado);
    });
  }

  test('com avaliação, a reserva soma os 20% da janela e os blocos depois dela', () => {
    const { entrada } = carregarFixture('capacidade-com-avaliacao.json');
    const r = calcularCapacidade(entrada);
    const depois = r.dias.filter((d) => !d.naJanela).reduce((soma, d) => soma + d.blocos.length, 0);

    assert.equal(depois, 7);
    assert.equal(r.capacidadeReserva, r.capacidadeTotal - r.capacidadeEstudo + depois);
    for (const dia of r.dias) {
      const depoisDaAvaliacao = diferencaEmDias('2026-11-13', dia.data) > 0;
      assert.equal(dia.naJanela, !depoisDaAvaliacao, dia.data);
    }
  });

  test('números da fixture com avaliação: total 11, estudo 8, reserva 3 + 7 = 10', () => {
    const { entrada } = carregarFixture('capacidade-com-avaliacao.json');
    const r = calcularCapacidade(entrada);
    assert.equal(r.capacidadeTotal, 11);
    assert.equal(r.capacidadeEstudo, 8);
    assert.equal(r.capacidadeReserva, 10);
  });

  test('avaliação antes do início: o período inteiro vira reserva', () => {
    // Caso legítimo no replanejamento depois da prova.
    const r = calcularCapacidade({
      inicio: '2026-11-16',
      fim: '2026-11-22',
      disponibilidade: { 1: 60, 2: 60 },
      dataAvaliacao: '2026-11-13',
    });
    assert.ok(r.dias.every((d) => !d.naJanela));
    assert.equal(r.capacidadeTotal, 0);
    assert.equal(r.capacidadeEstudo, 0);
    assert.equal(r.capacidadeReserva, 4);
  });

  test('avaliação depois do fim: o período inteiro é janela', () => {
    const { entrada, esperado } = carregarFixture('capacidade-duas-semanas.json');
    const r = calcularCapacidade({ ...entrada, dataAvaliacao: '2026-12-01' });
    assert.ok(r.dias.every((d) => d.naJanela));
    assert.equal(r.capacidadeTotal, esperado.capacidadeTotal);
    assert.equal(r.capacidadeReserva, esperado.capacidadeReserva);
  });

  test('disponibilidade também pode ser um array', () => {
    const { entrada, esperado } = carregarFixture('capacidade-duas-semanas.json');
    const comoArray = [0, 60, 60, 140, 60, 25, 10];
    assert.deepEqual(calcularCapacidade({ ...entrada, disponibilidade: comoArray }), esperado);
  });

  test('duracaoBlocoMin chega aos blocos de cada dia', () => {
    const r = calcularCapacidade({
      inicio: '2026-11-11',
      fim: '2026-11-11',
      disponibilidade: { 3: 100 },
      duracaoBlocoMin: 45,
    });
    assert.deepEqual(r.dias, [{ data: '2026-11-11', blocos: [45, 55], naJanela: true }]);
    assert.equal(r.capacidadeTotal, 2);
  });

  test('dia da semana sem valor em disponibilidade conta como 0', () => {
    const r = calcularCapacidade({ inicio: '2026-11-09', fim: '2026-11-15', disponibilidade: { 1: 60 } });
    assert.equal(r.capacidadeTotal, 2);
  });

  test('a fração de estudo arredonda para baixo', () => {
    // Um único dia com 1 bloco: floor(1 × 4 / 5) = 0, então o bloco inteiro é reserva.
    const r = calcularCapacidade({ inicio: '2026-11-09', fim: '2026-11-09', disponibilidade: { 1: 30 } });
    assert.equal(r.capacidadeTotal, 1);
    assert.equal(r.capacidadeEstudo, 0);
    assert.equal(r.capacidadeReserva, 1);
  });

  test('inicio igual a fim é um período de um dia', () => {
    const r = calcularCapacidade({ inicio: '2026-11-11', fim: '2026-11-11', disponibilidade: { 3: 140 } });
    assert.equal(r.dias.length, 1);
    assert.equal(r.capacidadeTotal, 4);
  });

  test('fim antes de inicio lança RangeError', () => {
    assert.throws(
      () => calcularCapacidade({ inicio: '2026-11-22', fim: '2026-11-09', disponibilidade: {} }),
      RangeError,
    );
  });

  test('minutos negativos lançam RangeError', () => {
    assert.throws(
      () => calcularCapacidade({ inicio: '2026-11-09', fim: '2026-11-15', disponibilidade: { 1: -30 } }),
      RangeError,
    );
  });

  test('datas inválidas lançam RangeError', () => {
    const base = { inicio: '2026-11-09', fim: '2026-11-15', disponibilidade: {} };
    assert.throws(() => calcularCapacidade({ ...base, inicio: '2026-11-31' }), RangeError);
    assert.throws(() => calcularCapacidade({ ...base, fim: '15/11/2026' }), RangeError);
    assert.throws(() => calcularCapacidade({ ...base, dataAvaliacao: '2026-02-30' }), RangeError);
    assert.throws(() => calcularCapacidade({ ...base, diasFolga: ['2026-11-1'] }), RangeError);
  });

  test('disponibilidade ausente lança RangeError', () => {
    assert.throws(() => calcularCapacidade({ inicio: '2026-11-09', fim: '2026-11-15' }), RangeError);
  });

  test('não muta a entrada', () => {
    const { entrada } = carregarFixture('capacidade-com-avaliacao.json');
    const copia = structuredClone(entrada);
    calcularCapacidade(entrada);
    assert.deepEqual(entrada, copia);
  });
});
