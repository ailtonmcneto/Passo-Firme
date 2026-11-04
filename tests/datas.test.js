import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehDataValida,
  somarDias,
  diferencaEmDias,
  diaDaSemana,
  intervaloDeDatas,
  hojeLocal,
} from '../js/util/datas.js';
import { carregarFixture } from './carregar-fixture.js';

const casos = carregarFixture('datas.json');

describe('diaDaSemana', () => {
  test("'2026-10-13' é terça (2)", () => {
    assert.equal(diaDaSemana('2026-10-13'), 2);
  });

  for (const { data, esperado } of casos.diaDaSemana) {
    test(`${data} → ${esperado}`, () => {
      assert.equal(diaDaSemana(data), esperado);
    });
  }
});

describe('somarDias', () => {
  test('virada de fevereiro em ano comum, bissexto e de ano', () => {
    assert.equal(somarDias('2026-02-28', 1), '2026-03-01');
    assert.equal(somarDias('2028-02-28', 1), '2028-02-29');
    assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  });

  for (const { data, n, esperado } of casos.somarDias) {
    test(`${data} + ${n} → ${esperado}`, () => {
      assert.equal(somarDias(data, n), esperado);
    });
  }

  test('n não inteiro lança RangeError', () => {
    assert.throws(() => somarDias('2026-11-09', 1.5), RangeError);
    assert.throws(() => somarDias('2026-11-09', '1'), RangeError);
  });
});

describe('diferencaEmDias', () => {
  test("de '2026-11-09' a '2026-11-22' são 13 dias", () => {
    assert.equal(diferencaEmDias('2026-11-09', '2026-11-22'), 13);
  });

  for (const { a, b, esperado } of casos.diferencaEmDias) {
    test(`${b} − ${a} = ${esperado}`, () => {
      assert.equal(diferencaEmDias(a, b), esperado);
    });
  }
});

describe('intervaloDeDatas', () => {
  test('duas semanas têm 14 datas, com as pontas incluídas', () => {
    assert.equal(intervaloDeDatas('2026-11-09', '2026-11-22').length, 14);
  });

  for (const { inicio, fim, tamanho, primeira, ultima } of casos.intervaloDeDatas) {
    test(`${inicio} a ${fim} → ${tamanho} datas`, () => {
      const datas = intervaloDeDatas(inicio, fim);
      assert.equal(datas.length, tamanho);
      if (tamanho > 0) {
        assert.equal(datas[0], primeira);
        assert.equal(datas.at(-1), ultima);
      }
    });
  }
});

describe('ehDataValida', () => {
  test("'2026-02-30' não existe", () => {
    assert.equal(ehDataValida('2026-02-30'), false);
  });

  for (const { valor, esperado } of casos.ehDataValida) {
    test(`${JSON.stringify(valor)} → ${esperado}`, () => {
      assert.equal(ehDataValida(valor), esperado);
    });
  }
});

describe('hojeLocal', () => {
  test('23h30 local ainda é o mesmo dia, em qualquer fuso', () => {
    // Com toISOString() isto viraria '2026-10-14' em São Paulo, porque lá 23h30 já é 02h30 em UTC.
    assert.equal(hojeLocal(new Date(2026, 9, 13, 23, 30)), '2026-10-13');
  });

  test('meia-noite local', () => {
    assert.equal(hojeLocal(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  });

  test('aceita só um Date válido', () => {
    assert.throws(() => hojeLocal('2026-10-13'), RangeError);
    assert.throws(() => hojeLocal(new Date(NaN)), RangeError);
    assert.throws(() => hojeLocal(), RangeError);
  });
});

describe('data inválida lança RangeError', () => {
  const invalidas = ['2026-02-30', '2026-13-01', '2026-1-5', '', null, undefined];
  for (const invalida of invalidas) {
    test(JSON.stringify(invalida) ?? 'undefined', () => {
      assert.throws(() => somarDias(invalida, 1), RangeError);
      assert.throws(() => diferencaEmDias(invalida, '2026-11-09'), RangeError);
      assert.throws(() => diferencaEmDias('2026-11-09', invalida), RangeError);
      assert.throws(() => diaDaSemana(invalida), RangeError);
      assert.throws(() => intervaloDeDatas(invalida, '2026-11-09'), RangeError);
      assert.throws(() => intervaloDeDatas('2026-11-09', invalida), RangeError);
    });
  }
});
