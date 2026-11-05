import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { alocar, maioresRestos, montarEntradaAlocacao } from '../js/core/alocador.js';
import { avaliarViabilidade } from '../js/core/viabilidade.js';
import { compararCanonico } from '../js/core/prioridade.js';
import { carregarFixture } from './carregar-fixture.js';

const FIXTURES = readdirSync(new URL('./fixtures/', import.meta.url))
  .filter((nome) => nome.startsWith('alocador-'))
  .sort();

function somar(numeros) {
  return numeros.reduce((soma, n) => soma + n, 0);
}

describe('alocar: fixtures', () => {
  test('existem as 12 fixtures (A a K, com I em dois casos)', () => {
    assert.equal(FIXTURES.length, 12);
  });

  for (const nome of FIXTURES) {
    test(nome, () => {
      const { entrada, entradaAlocacao, esperado } = carregarFixture(nome);
      assert.deepEqual(montarEntradaAlocacao(entrada.topicos), entradaAlocacao);
      assert.deepEqual(alocar({ topicos: entradaAlocacao, capacidade: entrada.capacidade }), esperado);
    });
  }
});

describe('alocar: casos comentados', () => {
  test('G: o alocador e a escapatória "reduzir demanda" dão saídas diferentes de propósito', () => {
    // Mesmos tópicos e mesma capacidade de estudo (14), duas perguntas diferentes.
    // "Reduzir demanda" (§4, R5) responde "o que eu corto?": tira blocos do fim da ordem
    // canônica, então d cai até 1 antes de c perder qualquer coisa (5/4/4/1). É uma proposta
    // que o aluno aceita ou não, e a lista mostra exatamente o que sai.
    // O alocador (§5) responde "como divido o que tenho?": garante 1 bloco a cada um e reparte
    // o resto em proporção à prioridade, com teto na demanda. d tem prioridade 3 contra 10 de
    // c, mas ainda leva uma fatia proporcional, então fica com 2 e c com 3 (5/4/3/2).
    const g = carregarFixture('alocador-g-saturacao-em-rodadas.json');
    const viabilidade = avaliarViabilidade(carregarFixture('viabilidade-inviavel.json').entrada);
    assert.equal(viabilidade.capacidadeEstudo, g.entrada.capacidade);

    const reduzir = Object.fromEntries(
      viabilidade.escapatorias.reduzirDemanda.topicos.map((t) => [t.id, t.depois]),
    );
    const alocado = alocar({ topicos: g.entradaAlocacao, capacidade: g.entrada.capacidade }).blocos;

    assert.deepEqual(reduzir, { a: 5, b: 4, c: 4, d: 1 });
    assert.deepEqual(alocado, { a: 5, b: 4, c: 3, d: 2 });
    assert.notDeepEqual(alocado, reduzir);
  });

  test('J: pela prioridade pura daria L 5 e SO 5, a regra descartada pelo R7', () => {
    // Conta da fixture: piso de 1 para cada um, resto 8; falta 9 ao manual e 4 ao automático,
    // F = 13; parte manual floor(72/13) = 5 (resto 7), automática floor(32/13) = 2 (resto 6);
    // o bloco que sobra vai ao manual, de maior resto. L = 1 + 6 = 7, SO = 1 + 2 = 3.
    // Se os dois disputassem o resto pela prioridade (9 contra 15), SO encheria até 5.
    const { entradaAlocacao } = carregarFixture('alocador-j-r7-proporcional.json');
    const semGrupos = entradaAlocacao.map((t) => ({ ...t, manual: false }));
    assert.deepEqual(alocar({ topicos: semGrupos, capacidade: 10 }).blocos, { L: 5, SO: 5 });
  });

  test('viável sem nenhum automático: o excedente volta como sobra', () => {
    const topicos = [{ id: 'm', prioridade: 4, demanda: 3, manual: true }];
    assert.deepEqual(alocar({ topicos, capacidade: 8 }), {
      blocos: { m: 3 },
      sobra: 5,
      viavel: true,
      avisos: [],
    });
  });

  test('sem tópicos, toda a capacidade é sobra', () => {
    assert.deepEqual(alocar({ topicos: [], capacidade: 4 }), { blocos: {}, sobra: 4, viavel: true, avisos: [] });
  });

  test('capacidade 0 com demanda: todos sem bloco, exceto quem já terminou', () => {
    const topicos = [
      { id: 'a', prioridade: 5, demanda: 2 },
      { id: 'b', prioridade: 9, demanda: 0 },
    ];
    assert.deepEqual(alocar({ topicos, capacidade: 0 }), {
      blocos: { a: 0, b: 0 },
      sobra: 0,
      viavel: false,
      avisos: [{ id: 'a', tipo: 'TOPICO_SEM_BLOCO' }],
    });
  });

  test('ordem omitida vale a posição de entrada', () => {
    // Mesma prioridade, 1 bloco para 2 tópicos: fica com o primeiro cadastrado.
    const topicos = [
      { id: 'p', prioridade: 6, demanda: 2 },
      { id: 'q', prioridade: 6, demanda: 2 },
    ];
    assert.deepEqual(alocar({ topicos, capacidade: 1 }).blocos, { p: 1, q: 0 });
  });

  for (const [nome, entrada] of [
    ['capacidade negativa', { topicos: [], capacidade: -1 }],
    ['capacidade fracionária', { topicos: [], capacidade: 2.5 }],
    ['demanda negativa', { topicos: [{ id: 'a', prioridade: 1, demanda: -1 }], capacidade: 3 }],
    ['demanda ausente', { topicos: [{ id: 'a', prioridade: 1 }], capacidade: 3 }],
  ]) {
    test(`${nome} lança RangeError`, () => {
      assert.throws(() => alocar(entrada), RangeError);
    });
  }

  test('não muta a entrada', () => {
    const { entradaAlocacao } = carregarFixture('alocador-k-dois-manuais.json');
    const copia = structuredClone(entradaAlocacao);
    alocar({ topicos: entradaAlocacao, capacidade: 12 });
    assert.deepEqual(entradaAlocacao, copia);
  });
});

describe('montarEntradaAlocacao', () => {
  test('ordem explícita é mantida; a que falta vira o índice', () => {
    const r = montarEntradaAlocacao([
      { id: 'a', peso: 1, dominio: 1, ordem: 7 },
      { id: 'b', peso: 1, dominio: 1 },
    ]);
    assert.deepEqual(r.map((t) => t.ordem), [7, 1]);
  });

  test('demandaRestante substitui a demanda, inclusive de manual', () => {
    const [t] = montarEntradaAlocacao([{ id: 'm', peso: 2, dominio: 1, blocosDesejados: 9, demandaRestante: 3 }]);
    assert.deepEqual(t, { id: 'm', prioridade: 10, demanda: 3, manual: true, ordem: 0 });
  });

  test('demandaRestante null é o mesmo que ausente', () => {
    const [t] = montarEntradaAlocacao([{ id: 'a', peso: 2, dominio: 1, demandaRestante: null }]);
    assert.equal(t.demanda, 5);
  });

  for (const invalido of [-1, 1.5, '2']) {
    test(`demandaRestante ${JSON.stringify(invalido)} lança RangeError`, () => {
      assert.throws(
        () => montarEntradaAlocacao([{ id: 'a', peso: 2, dominio: 1, demandaRestante: invalido }]),
        RangeError,
      );
    });
  }
});

describe('maioresRestos', () => {
  test('quota pelo floor e sobras por resto decrescente', () => {
    // S = 30, n = 10: 25·10/30 = 8 r10 e 5·10/30 = 1 r20; a sobra vai ao de resto 20.
    assert.deepEqual(maioresRestos([{ id: 'A', prioridade: 25 }, { id: 'B', prioridade: 5 }], 10), [8, 2]);
  });

  test('empate de resto segue a ordem canônica, não a posição', () => {
    // Prioridades iguais, 1 bloco: vence a menor ordem, mesmo vindo depois no array.
    const topicos = [{ id: 'x', prioridade: 3, ordem: 4 }, { id: 'y', prioridade: 3, ordem: 2 }];
    assert.deepEqual(maioresRestos(topicos, 1), [0, 1]);
  });

  test('n = 0 dá zero para todos, mesmo sem tópicos', () => {
    assert.deepEqual(maioresRestos([{ id: 'a', prioridade: 4 }], 0), [0]);
    assert.deepEqual(maioresRestos([], 0), []);
  });

  test('n inválido ou sem peso para distribuir lança RangeError', () => {
    assert.throws(() => maioresRestos([{ id: 'a', prioridade: 4 }], -1), RangeError);
    assert.throws(() => maioresRestos([{ id: 'a', prioridade: 4 }], 1.5), RangeError);
    assert.throws(() => maioresRestos([], 3), RangeError);
  });
});

// Gerador congruencial linear (constantes do Numerical Recipes) com semente fixa. Os casos
// parecem aleatórios mas são sempre os mesmos, então uma falha se reproduz em qualquer máquina.
function criarGerador(semente) {
  let estado = semente >>> 0;
  return (n) => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    // Os bits altos de um LCG são os de melhor qualidade.
    return (estado >>> 16) % n;
  };
}

function gerarCaso(sortear) {
  const quantidade = 1 + sortear(8);
  const topicos = [];
  for (let i = 0; i < quantidade; i++) {
    const t = { id: `t${i}`, peso: 1 + sortear(5), dominio: 1 + sortear(5) };
    if (sortear(3) === 0) t.blocosDesejados = 1 + sortear(11);
    // Também exercita a convenção do replanejamento, inclusive o tópico já terminado.
    if (sortear(6) === 0) t.demandaRestante = sortear(6);
    topicos.push(t);
  }
  return { topicos, capacidade: sortear(61) };
}

describe('alocar: propriedades (2000 casos determinísticos)', () => {
  const sortear = criarGerador(20261105);
  const casos = Array.from({ length: 2000 }, () => gerarCaso(sortear));

  test('o gerador cobre os dois casos e os manuais', () => {
    const entradas = casos.map((c) => montarEntradaAlocacao(c.topicos));
    const viaveis = casos.filter((c, i) => somar(entradas[i].map((t) => t.demanda)) <= c.capacidade);
    assert.ok(viaveis.length > 200 && viaveis.length < 1800, `viáveis: ${viaveis.length}`);
    assert.ok(entradas.flat().filter((t) => t.manual).length > 1500);
  });

  test('invariantes do §5', () => {
    for (const [n, caso] of casos.entries()) {
      const topicos = montarEntradaAlocacao(caso.topicos);
      const { capacidade } = caso;
      const r = alocar({ topicos, capacidade });
      const contexto = `caso ${n}: ${JSON.stringify(caso)}`;
      const recebido = (t) => r.blocos[t.id];
      const total = somar(topicos.map(recebido));
      const demandaTotal = somar(topicos.map((t) => t.demanda));

      assert.ok(total <= capacidade, contexto);
      assert.equal(r.viavel, demandaTotal <= capacidade, contexto);
      for (const t of topicos) {
        if (t.demanda === 0) assert.equal(recebido(t), 0, contexto);
      }

      if (r.viavel) {
        assert.equal(total + r.sobra, capacidade, contexto);
        assert.deepEqual(r.avisos, [], contexto);
        for (const t of topicos) {
          assert.ok(recebido(t) >= t.demanda, contexto);
          if (t.manual) assert.equal(recebido(t), t.demanda, contexto);
        }
        const temElegivel = topicos.some((t) => !t.manual && t.demanda > 0);
        if (temElegivel) assert.equal(r.sobra, 0, contexto);
        continue;
      }

      assert.equal(total, capacidade, contexto);
      assert.equal(r.sobra, 0, contexto);
      for (const t of topicos) assert.ok(recebido(t) <= t.demanda, contexto);

      const ativos = topicos.filter((t) => t.demanda > 0);
      if (capacidade >= ativos.length) {
        for (const t of ativos) assert.ok(recebido(t) >= 1, contexto);
      } else {
        // R16: quem tem bloco são exatamente os primeiros da ordem canônica.
        const primeiros = [...ativos].sort(compararCanonico).slice(0, capacidade).map((t) => t.id);
        assert.deepEqual(ativos.filter((t) => recebido(t) === 1).map((t) => t.id).sort(), primeiros.sort(), contexto);
      }

      const avisosEsperados = ativos.flatMap((t) => {
        if (recebido(t) === 0) return [{ id: t.id, tipo: 'TOPICO_SEM_BLOCO' }];
        if (t.manual && recebido(t) < t.demanda) {
          return [{ id: t.id, tipo: 'QUOTA_MANUAL_REDUZIDA', desejado: t.demanda, recebido: recebido(t) }];
        }
        return [];
      });
      assert.deepEqual(r.avisos, avisosEsperados, contexto);
    }
  });

  test('determinismo: mesma entrada dá a mesma saída, em qualquer ordem do array', () => {
    for (const [n, caso] of casos.entries()) {
      const topicos = montarEntradaAlocacao(caso.topicos);
      const r = alocar({ topicos, capacidade: caso.capacidade });
      assert.deepEqual(alocar({ topicos: structuredClone(topicos), capacidade: caso.capacidade }), r, `caso ${n}`);
      // Com `ordem` fixa, a posição no array não pode influir na quantidade de blocos.
      const invertidos = [...topicos].reverse();
      assert.deepEqual(alocar({ topicos: invertidos, capacidade: caso.capacidade }).blocos, r.blocos, `caso ${n}`);
    }
  });

  test('maioresRestos: soma n e cada quota fica a menos de 1 da proporção exata', () => {
    for (const caso of casos) {
      const topicos = montarEntradaAlocacao(caso.topicos);
      const n = caso.capacidade;
      const quotas = maioresRestos(topicos, n);
      const S = somar(topicos.map((t) => t.prioridade));
      assert.equal(somar(quotas), n);
      topicos.forEach((t, i) => {
        const piso = Math.floor((t.prioridade * n) / S);
        assert.ok(quotas[i] === piso || quotas[i] === piso + 1);
      });
    }
  });
});
