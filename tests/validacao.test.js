import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validarPlano } from '../js/util/validacao.js';

describe('validarPlano', () => {
  const valido = {
    inicio: '2026-11-09',
    fim: '2026-11-22',
    disponibilidade: { 1: 60, 3: 140 },
    diasFolga: [],
    duracaoBlocoMin: 30,
    dataAvaliacao: '2026-11-20',
  };

  test('plano válido não lança', () => {
    assert.doesNotThrow(() => validarPlano(valido));
  });

  test('sem dataAvaliacao e sem duracaoBlocoMin, usa os padrões', () => {
    const { dataAvaliacao, duracaoBlocoMin, ...semOpcionais } = valido;
    assert.doesNotThrow(() => validarPlano(semOpcionais));
  });

  test('dataAvaliacao nas bordas do período é aceita', () => {
    assert.doesNotThrow(() => validarPlano({ ...valido, dataAvaliacao: '2026-11-09' }));
    assert.doesNotThrow(() => validarPlano({ ...valido, dataAvaliacao: '2026-11-22' }));
  });

  test('inicio inválido lança RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, inicio: '2026-11-31' }), RangeError);
    assert.throws(() => validarPlano({ ...valido, inicio: undefined }), RangeError);
  });

  test('fim inválido lança RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, fim: '22/11/2026' }), RangeError);
  });

  test('fim antes de inicio lança RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, fim: '2026-11-08', dataAvaliacao: null }), RangeError);
  });

  test('dataAvaliacao antes de inicio lança RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, dataAvaliacao: '2026-11-08' }), RangeError);
  });

  test('dataAvaliacao depois de fim lança RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, dataAvaliacao: '2026-11-23' }), RangeError);
  });

  test('dataAvaliacao inválida lança RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, dataAvaliacao: '2026-02-30' }), RangeError);
  });

  test('minutos negativos na disponibilidade lançam RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, disponibilidade: { 1: -30 } }), RangeError);
    assert.throws(() => validarPlano({ ...valido, disponibilidade: [0, 60, -1] }), RangeError);
  });

  test('duracaoBlocoMin menor que 15 lança RangeError', () => {
    assert.throws(() => validarPlano({ ...valido, duracaoBlocoMin: 14 }), RangeError);
    assert.throws(() => validarPlano({ ...valido, duracaoBlocoMin: 0 }), RangeError);
    assert.doesNotThrow(() => validarPlano({ ...valido, duracaoBlocoMin: 15 }));
  });
});
