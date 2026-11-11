import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESERVA,
  mapearParaDias,
  ordenarPorPosicaoIdeal,
  sequenciar,
  sequenciarRevezamento,
} from '../js/core/sequenciador.js';
import { alocar } from '../js/core/alocador.js';
import { calcularCapacidade } from '../js/core/capacidade.js';
import { carregarFixture } from './carregar-fixture.js';

describe('ordenarPorPosicaoIdeal', () => {
  test('A: golden 10/1/2/2 (caso F do alocador)', () => {
    // Posições com N = 15: L (quota 10) em 0,75; 2,25; 3,75; 5,25 … 14,25. DB e DE (quota 2)
    // em 3,75 e 11,25; SO (quota 1) em 7,5. Em 3,75 e 11,25, L, DB e DE empatam na posição, e
    // "menor quota primeiro" põe DB e DE antes de L; entre DB e DE decide a ordem canônica
    // (mesma prioridade, DB cadastrada antes). Os trechos L,L e L,L,L são esperados: L tem 2/3
    // dos blocos, e o R13 não prevê correção.
    const { entrada, esperado } = carregarFixture('sequenciador-10-1-2-2.json');
    const f = carregarFixture('alocador-f-10-1-2-2.json');
    assert.deepEqual(entrada.quotas, alocar({ topicos: f.entradaAlocacao, capacidade: 15 }).blocos);

    assert.deepEqual(ordenarPorPosicaoIdeal(entrada), esperado);
    assert.equal(esperado.join(','), 'L,L,DB,DE,L,L,L,SO,L,L,DB,DE,L,L,L');
  });

  test('sem `ordem`, vale a posição no array (como no alocador)', () => {
    const topicos = [{ id: 'x', prioridade: 5 }, { id: 'y', prioridade: 5 }];
    assert.deepEqual(ordenarPorPosicaoIdeal({ quotas: { x: 1, y: 1 }, topicos, N: 2 }), ['x', 'y']);
  });

  test('matéria ausente em `quotas` tem quota 0', () => {
    const topicos = [{ id: 'x', prioridade: 5, ordem: 0 }, { id: 'y', prioridade: 3, ordem: 1 }];
    assert.deepEqual(ordenarPorPosicaoIdeal({ quotas: { y: 2 }, topicos, N: 2 }), ['y', 'y']);
  });
});

describe('sequenciar: fixtures', () => {
  // Monta a entrada de sequenciar a partir da fixture, que guarda o nome da fixture de
  // capacidade em vez de repetir os 14 dias.
  function rodar(nome) {
    const fixture = carregarFixture(nome);
    const capacidade = calcularCapacidade(carregarFixture(fixture.entrada.fixtureCapacidade).entrada);
    const { alocacao, topicos, modoCobertura } = fixture.entrada;
    return { fixture, capacidade, blocos: sequenciar({ capacidade, alocacao, topicos, modoCobertura }) };
  }

  test('B: duas semanas, alocação do caso G', () => {
    // Dois tipos de empate:
    // - b e RESERVA têm quota 4 e empatam nas quatro posições (2,25; 6,75; 11,25; 15,75): pela
    //   regra 2, b vem antes e o bloco livre fica logo depois do estudo;
    // - na posição 9, a (quota 5, k = 2: 5·18/10) e c (quota 3, k = 1: 3·18/6) empatam: pela
    //   regra 1, c (menor quota) vem antes.
    const { fixture, capacidade, blocos } = rodar('sequenciador-duas-semanas.json');
    const g = carregarFixture('alocador-g-saturacao-em-rodadas.json');
    assert.deepEqual(fixture.entrada.alocacao.blocos, alocar({ topicos: g.entradaAlocacao, capacidade: 14 }).blocos);

    const { quotaReserva, N, sequencia } = fixture.esperado;
    assert.equal(quotaReserva, capacidade.capacidadeTotal - capacidade.capacidadeEstudo + fixture.entrada.alocacao.sobra);
    const quotas = { ...fixture.entrada.alocacao.blocos, [RESERVA]: quotaReserva };
    assert.deepEqual(ordenarPorPosicaoIdeal({ quotas, topicos: fixture.entrada.topicos, N }), sequencia);
    assert.deepEqual(blocos, fixture.esperado.blocos);
  });

  test('C: com avaliação, os dias depois da prova são inteiros RESERVA', () => {
    // a e RESERVA têm quota 3 e empatam nas três posições; a matéria vem antes.
    const { fixture, blocos } = rodar('sequenciador-com-avaliacao.json');
    const g = carregarFixture('alocador-g-saturacao-em-rodadas.json');
    const alocado = alocar({ topicos: g.entradaAlocacao, capacidade: 8 });
    assert.deepEqual(alocado.blocos, { a: 3, b: 2, c: 2, d: 1 });
    assert.deepEqual(fixture.entrada.alocacao, { blocos: alocado.blocos, sobra: alocado.sobra });

    const { quotaReserva, N, sequencia } = fixture.esperado;
    assert.equal(quotaReserva, 3);
    const quotas = { ...alocado.blocos, [RESERVA]: quotaReserva };
    assert.deepEqual(ordenarPorPosicaoIdeal({ quotas, topicos: fixture.entrada.topicos, N }), sequencia);
    assert.deepEqual(blocos, fixture.esperado.blocos);
    assert.ok(blocos.filter((b) => b.data > '2026-11-13').every((b) => b.tipo === 'RESERVA'));
  });
});

describe('sequenciarRevezamento', () => {
  const topicos = [
    { id: 'a', prioridade: 9, ordem: 0 },
    { id: 'b', prioridade: 5, ordem: 1 },
    { id: 'c', prioridade: 2, ordem: 2 },
  ];

  test('D: a 2, b 1, c 2 dá a,b,c,a,c', () => {
    assert.deepEqual(sequenciarRevezamento({ a: 2, b: 1, c: 2 }, topicos), ['a', 'b', 'c', 'a', 'c']);
  });

  test('a RESERVA fecha cada rodada enquanto tiver blocos', () => {
    assert.deepEqual(
      sequenciarRevezamento({ a: 2, b: 1, [RESERVA]: 2 }, topicos),
      ['a', 'b', RESERVA, 'a', RESERVA],
    );
  });

  test('segue a ordem canônica, não a do array', () => {
    assert.deepEqual(sequenciarRevezamento({ a: 1, b: 1, c: 1 }, [...topicos].reverse()), ['a', 'b', 'c']);
  });
});

describe('mapearParaDias', () => {
  test('numera os blocos dentro de cada dia e põe RESERVA fora da janela', () => {
    const dias = [
      { data: '2026-11-09', blocos: [30, 45], naJanela: true },
      { data: '2026-11-10', blocos: [], naJanela: true },
      { data: '2026-11-11', blocos: [30], naJanela: false },
    ];
    assert.deepEqual(mapearParaDias(['a', RESERVA], dias), [
      { data: '2026-11-09', ordem: 1, topicoId: 'a', tipo: 'ESTUDO', duracaoMin: 30 },
      { data: '2026-11-09', ordem: 2, topicoId: null, tipo: 'RESERVA', duracaoMin: 45 },
      { data: '2026-11-11', ordem: 1, topicoId: null, tipo: 'RESERVA', duracaoMin: 30 },
    ]);
  });

  test('dia com `ordens` (slots ocupados, §3) numera pelos slots que sobraram', () => {
    // No dia 09 a posição 2 está ocupada por um bloco mantido: os livres são a 1 e a 3.
    const dias = [
      { data: '2026-11-09', blocos: [30, 50], naJanela: true, ordens: [1, 3] },
      { data: '2026-11-10', blocos: [30, 30], naJanela: true },
      { data: '2026-11-11', blocos: [30], naJanela: false, ordens: [2] },
    ];
    assert.deepEqual(mapearParaDias(['a', 'b', RESERVA, 'a'], dias), [
      { data: '2026-11-09', ordem: 1, topicoId: 'a', tipo: 'ESTUDO', duracaoMin: 30 },
      { data: '2026-11-09', ordem: 3, topicoId: 'b', tipo: 'ESTUDO', duracaoMin: 50 },
      { data: '2026-11-10', ordem: 1, topicoId: null, tipo: 'RESERVA', duracaoMin: 30 },
      { data: '2026-11-10', ordem: 2, topicoId: 'a', tipo: 'ESTUDO', duracaoMin: 30 },
      { data: '2026-11-11', ordem: 2, topicoId: null, tipo: 'RESERVA', duracaoMin: 30 },
    ]);
  });

  test('sequência de tamanho diferente dos slots da janela lança RangeError', () => {
    const dias = [{ data: '2026-11-09', blocos: [30, 30], naJanela: true }];
    assert.throws(() => mapearParaDias(['a'], dias), RangeError);
    assert.throws(() => mapearParaDias(['a', 'b', 'c'], dias), RangeError);
  });
});

describe('erros', () => {
  const topicos = [{ id: 'a', prioridade: 5, ordem: 0 }, { id: 'b', prioridade: 3, ordem: 1 }];

  test('H: soma das quotas diferente de N lança RangeError', () => {
    assert.throws(() => ordenarPorPosicaoIdeal({ quotas: { a: 2, b: 1 }, topicos, N: 4 }), RangeError);
    assert.throws(() => ordenarPorPosicaoIdeal({ quotas: { a: 2, b: 1, [RESERVA]: 2 }, topicos, N: 4 }), RangeError);
  });

  test('H: em sequenciar, a soma é conferida nos dois modos', () => {
    const { entrada } = carregarFixture('cobertura-plano-curto.json');
    const capacidade = calcularCapacidade(entrada.plano);
    // Alocação com a capacidade de estudo (6), mas no modo cobertura a RESERVA é só a sobra:
    // faltam 2 blocos para chegar a N = 8.
    const alocacao = { blocos: { a: 3, b: 1, c: 1, d: 1 }, sobra: 0 };
    const mats = [
      { id: 'a', prioridade: 25, ordem: 0 },
      { id: 'b', prioridade: 16, ordem: 1 },
      { id: 'c', prioridade: 10, ordem: 2 },
      { id: 'd', prioridade: 3, ordem: 3 },
    ];
    assert.doesNotThrow(() => sequenciar({ capacidade, alocacao, topicos: mats }));
    assert.throws(() => sequenciar({ capacidade, alocacao, topicos: mats, modoCobertura: true }), RangeError);
  });

  test('quota de id desconhecido, quota inválida ou matéria chamada RESERVA lançam RangeError', () => {
    assert.throws(() => ordenarPorPosicaoIdeal({ quotas: { a: 1, z: 1 }, topicos, N: 2 }), RangeError);
    assert.throws(() => ordenarPorPosicaoIdeal({ quotas: { a: -1, b: 2 }, topicos, N: 1 }), RangeError);
    assert.throws(() => ordenarPorPosicaoIdeal({ quotas: { a: 1.5, b: 0.5 }, topicos, N: 2 }), RangeError);
    assert.throws(
      () => ordenarPorPosicaoIdeal({ quotas: { [RESERVA]: 1 }, topicos: [{ id: RESERVA, prioridade: 1 }], N: 1 }),
      RangeError,
    );
  });
});

describe('I: propriedades (500 casos aleatórios com semente fixa)', () => {
  // Gerador congruente linear (minstd de Park e Miller). O produto fica abaixo de 2^47, então a
  // conta é exata em double, e o Java pode reproduzir a mesma sequência com long.
  function criarGerador(semente) {
    let estado = semente;
    return (min, max) => {
      estado = (estado * 48271) % 2147483647;
      return min + (estado % (max - min + 1));
    };
  }

  const sortear = criarGerador(20261109);
  const casos = [];
  for (let c = 0; c < 500; c++) {
    const n = sortear(1, 8);
    const topicos = [];
    const quotas = {};
    for (let i = 0; i < n; i++) {
      topicos.push({ id: `t${i}`, prioridade: sortear(1, 25), ordem: i });
      quotas[`t${i}`] = sortear(0, 12);
    }
    quotas[RESERVA] = sortear(0, 6);
    const N = Object.values(quotas).reduce((s, q) => s + q, 0);
    casos.push({ quotas, topicos, N });
  }

  function contar(sequencia) {
    const contagem = {};
    for (const id of sequencia) contagem[id] = (contagem[id] ?? 0) + 1;
    return contagem;
  }

  function semZeros(quotas) {
    return Object.fromEntries(Object.entries(quotas).filter(([, q]) => q > 0));
  }

  test('cada id aparece exatamente quota vezes e o tamanho é N', () => {
    for (const caso of casos) {
      const esperado = semZeros(caso.quotas);
      const posicao = ordenarPorPosicaoIdeal(caso);
      assert.equal(posicao.length, caso.N);
      assert.deepEqual(contar(posicao), esperado);

      const revezamento = sequenciarRevezamento(caso.quotas, caso.topicos);
      assert.equal(revezamento.length, caso.N);
      assert.deepEqual(contar(revezamento), esperado);
    }
  });

  test('a mesma entrada dá a mesma saída', () => {
    for (const caso of casos) {
      assert.deepEqual(ordenarPorPosicaoIdeal(caso), ordenarPorPosicaoIdeal(structuredClone(caso)));
      assert.deepEqual(
        sequenciarRevezamento(caso.quotas, caso.topicos),
        sequenciarRevezamento(structuredClone(caso.quotas), structuredClone(caso.topicos)),
      );
    }
  });

  test('inverter o array de matérias (mantendo `ordem`) não muda a sequência', () => {
    for (const caso of casos) {
      const invertido = { ...caso, topicos: [...caso.topicos].reverse() };
      assert.deepEqual(ordenarPorPosicaoIdeal(invertido), ordenarPorPosicaoIdeal(caso));
      assert.deepEqual(
        sequenciarRevezamento(caso.quotas, invertido.topicos),
        sequenciarRevezamento(caso.quotas, caso.topicos),
      );
    }
  });

  test('no revezamento, entre duas aparições da mesma matéria aparecem todas as outras que ainda têm blocos', () => {
    for (const caso of casos) {
      const seq = sequenciarRevezamento(caso.quotas, caso.topicos);
      for (let i = 0; i < seq.length; i++) {
        const j = seq.indexOf(seq[i], i + 1);
        if (j === -1) continue;
        // "Ainda tem blocos" em i: aparece em algum ponto depois de i.
        const pendentes = new Set(seq.slice(i + 1).filter((id) => id !== seq[i]));
        const entre = new Set(seq.slice(i + 1, j));
        for (const id of pendentes) {
          assert.ok(entre.has(id), `${id} deveria aparecer entre as posições ${i} e ${j} de ${seq.join(',')}`);
        }
      }
    }
  });
});
