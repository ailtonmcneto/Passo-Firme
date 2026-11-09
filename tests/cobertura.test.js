import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarRetaFinal,
  condicaoDeCobertura,
  dataAlvo,
  estadoCobertura,
} from '../js/core/cobertura.js';
import { avaliarViabilidade } from '../js/core/viabilidade.js';
import { calcularCapacidade } from '../js/core/capacidade.js';
import { alocar, montarEntradaAlocacao } from '../js/core/alocador.js';
import { sequenciar } from '../js/core/sequenciador.js';
import { carregarFixture } from './carregar-fixture.js';

describe('dataAlvo', () => {
  test('é a dataAvaliacao quando existe; senão, o fim', () => {
    assert.equal(dataAlvo({ fim: '2026-11-22', dataAvaliacao: '2026-11-13' }), '2026-11-13');
    assert.equal(dataAlvo({ fim: '2026-11-22' }), '2026-11-22');
    assert.equal(dataAlvo({ fim: '2026-11-22', dataAvaliacao: null }), '2026-11-22');
  });
});

describe('E: reta final num plano curto', () => {
  const { entrada, esperado, quatroDiasAntes } = carregarFixture('cobertura-plano-curto.json');
  const { plano, topicos, hoje } = entrada;
  const viabilidade = avaliarViabilidade({ plano, topicos });

  test('a viabilidade normal não cabe', () => {
    const { capacidadeEstudo, demandaTotal, viavel, cobertura } = viabilidade;
    assert.deepEqual({ capacidadeEstudo, demandaTotal, viavel, cobertura }, esperado.viabilidade);
  });

  test('a condição vale: faltam 3 dias', () => {
    assert.equal(condicaoDeCobertura({ plano, viabilidade, hoje }), esperado.condicao);
    assert.equal(esperado.condicao, true);
  });

  test('avaliarRetaFinal: os 8 blocos viram estudo', () => {
    assert.deepEqual(avaliarRetaFinal({ plano, topicos }), esperado.retaFinal);
  });

  test('com o modo ativo: alocação com a capacidade total e sequência em revezamento', () => {
    // É o que o pipeline vai fazer quando estadoCobertura for ATIVA.
    const capacidade = calcularCapacidade(plano);
    const entradaAlocacao = montarEntradaAlocacao(topicos);
    const { blocos: quotas, sobra } = alocar({ topicos: entradaAlocacao, capacidade: capacidade.capacidadeTotal });
    assert.deepEqual({ blocos: quotas, sobra }, esperado.alocacao);

    const blocos = sequenciar({
      capacidade,
      alocacao: { blocos: quotas, sobra },
      topicos: entradaAlocacao,
      modoCobertura: true,
    });
    assert.deepEqual(blocos, esperado.blocos);
    assert.deepEqual(blocos.map((b) => b.topicoId), esperado.sequencia);
    assert.ok(blocos.every((b) => b.tipo === 'ESTUDO'));
  });

  test('começando no domingo e com hoje 08/11, faltam 4 dias: a condição não vale', () => {
    const v = avaliarViabilidade({ plano: quatroDiasAntes.plano, topicos });
    assert.equal(v.viavel, false);
    assert.equal(
      condicaoDeCobertura({ plano: quatroDiasAntes.plano, viabilidade: v, hoje: quatroDiasAntes.hoje }),
      quatroDiasAntes.condicao,
    );
    assert.equal(quatroDiasAntes.condicao, false);
  });

  test('a condição usa dataAvaliacao quando existe', () => {
    const comProva = { ...plano, fim: '2026-11-30', dataAvaliacao: '2026-11-12' };
    const v = avaliarViabilidade({ plano: comProva, topicos });
    assert.equal(condicaoDeCobertura({ plano: comProva, viabilidade: v, hoje }), true);
  });
});

describe('F: reta final resolvendo o bloqueio', () => {
  const fixture = carregarFixture('cobertura-reta-final-bloqueio.json');
  const { plano, topicos } = carregarFixture(fixture.fixtureViabilidade).casos[0].entrada;

  test('o plano normal é bloqueante', () => {
    const { capacidadeEstudo, bloqueante } = avaliarViabilidade({ plano, topicos });
    assert.deepEqual({ capacidadeEstudo, bloqueante }, fixture.normal);
    assert.equal(fixture.normal.bloqueante, true);
  });

  test('a reta final não é bloqueante: 3 blocos para 3 matérias', () => {
    const viabilidade = avaliarViabilidade({ plano, topicos });
    assert.equal(condicaoDeCobertura({ plano, viabilidade, hoje: fixture.hoje }), true);
    assert.deepEqual(avaliarRetaFinal({ plano, topicos }), fixture.retaFinal);
    assert.equal(fixture.retaFinal.bloqueante, false);
  });

  test('com W, são 4 matérias para 3 blocos: a reta final também bloqueia', () => {
    const comW = [...topicos, fixture.comW.topicoAMais];
    assert.deepEqual(avaliarRetaFinal({ plano, topicos: comW }), fixture.comW.retaFinal);
    assert.equal(fixture.comW.retaFinal.bloqueante, true);
  });
});

describe('G: estadoCobertura', () => {
  const { entrada, estados } = carregarFixture('cobertura-plano-curto.json');

  for (const caso of estados) {
    test(`${caso.nome} → ${caso.esperado}`, () => {
      const topicos = caso.topicos
        ? entrada.topicos.filter((t) => caso.topicos.includes(t.id))
        : entrada.topicos;
      const plano = { ...entrada.plano, respostaCobertura: caso.respostaCobertura };
      const viabilidade = avaliarViabilidade({ plano, topicos });
      assert.equal(estadoCobertura({ plano, viabilidade, hoje: caso.hoje }), caso.esperado);
    });
  }

  test('sem o campo respostaCobertura, é como null', () => {
    const viabilidade = avaliarViabilidade(entrada);
    assert.equal(estadoCobertura({ plano: entrada.plano, viabilidade, hoje: entrada.hoje }), 'PERGUNTAR');
  });

  test('resposta com valor desconhecido conta como sem resposta', () => {
    const plano = { ...entrada.plano, respostaCobertura: { resposta: 'TALVEZ', dataAlvo: '2026-11-12' } };
    const viabilidade = avaliarViabilidade({ plano, topicos: entrada.topicos });
    assert.equal(estadoCobertura({ plano, viabilidade, hoje: entrada.hoje }), 'PERGUNTAR');
  });
});

describe('avaliarRetaFinal: demanda', () => {
  const plano = { inicio: '2026-11-09', fim: '2026-11-12', disponibilidade: { 1: 60, 2: 60, 3: 60, 4: 60 } };

  test('respeita demandaRestante, como montarEntradaAlocacao', () => {
    const topicos = [
      { id: 'a', peso: 5, dominio: 1, demandaRestante: 2 },
      { id: 'b', peso: 4, dominio: 2, demandaRestante: 0 },
    ];
    assert.deepEqual(avaliarRetaFinal({ plano, topicos }), {
      capacidadeEstudo: 8,
      demandaTotal: 2,
      cobertura: { percentual: 100 },
      bloqueante: false,
    });
  });

  test('sem demanda, cobertura 100% e sem bloqueio', () => {
    assert.deepEqual(avaliarRetaFinal({ plano, topicos: [] }), {
      capacidadeEstudo: 8,
      demandaTotal: 0,
      cobertura: { percentual: 100 },
      bloqueante: false,
    });
  });
});
