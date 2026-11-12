import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encaixarRevisoes, preencherReservaDeHoje } from '../js/core/revisoes.js';
import { carregarFixture } from './carregar-fixture.js';
import { notacao } from './notacao.js';

// Nas fixtures, `estados` é um objeto { id: estado }, porque JSON não tem Map.
function paraMap(estados) {
  return new Map(Object.entries(estados));
}

// Matérias dos casos: x (prioridade 20, demanda 3), y (10, 2) e z (5, 0). Hoje 13/11, fim 22/11.
// Salvo indicação, x foi estudada em 11/11 com intervalo 1: a revisão venceu em 12/11.
describe('encaixarRevisoes', () => {
  const { topicos, casos } = carregarFixture('revisoes-encaixar.json');

  function rodar(nome) {
    const { entrada, esperado } = casos.find((c) => c.nome === nome);
    const saida = encaixarRevisoes({ ...entrada, topicos, estados: paraMap(entrada.estados) });
    assert.deepEqual(saida, esperado, nome);
    return { entrada, saida };
  }

  test('U1: o estudo vem depois do slot, então a revisão entra hoje', () => {
    const { saida } = rodar('U1');
    assert.equal(notacao(saida.blocos), '11-13 #1:revx; 11-16 #1:x #2:R');
    assert.deepEqual(saida.avisos, []);
  });

  test('U2 (C5): o estudo de hoje vem antes do slot; nada muda e não há aviso', () => {
    const { entrada, saida } = rodar('U2');
    assert.deepEqual(saida.blocos, entrada.blocos);
    assert.deepEqual(saida.avisos, []);
  });

  test('U3: entre duas devidas hoje, a de menor retenção escolhe primeiro', () => {
    // x: 4 dias desde a última, intervalo 3 (4/3). y: 6 dias, intervalo 3 (6/3). y esqueceu mais.
    const { saida } = rodar('U3');
    assert.equal(notacao(saida.blocos), '11-13 #1:revy; 11-16 #1:revx');
  });

  test('U4: sem slot livre e sem estudo futuro, aviso REVISAO_SEM_ESPACO', () => {
    const { entrada, saida } = rodar('U4');
    assert.deepEqual(saida.blocos, entrada.blocos);
    assert.deepEqual(saida.avisos, [{ id: 'x', tipo: 'REVISAO_SEM_ESPACO', devida: '2026-11-13' }]);
  });

  test('U4b: na reta final, a falta de espaço é proposital e não avisa', () => {
    const { saida } = rodar('U4b');
    assert.deepEqual(saida.avisos, []);
  });

  test('U5: matéria pulada hoje só recebe revisão de amanhã em diante', () => {
    const { saida } = rodar('U5');
    assert.equal(notacao(saida.blocos), '11-13 #1:x[P] #2:R; 11-16 #1:revx');
  });

  test('U6: revisão que vence depois do fim não é candidata', () => {
    const { entrada, saida } = rodar('U6');
    assert.deepEqual(saida.blocos, entrada.blocos);
    assert.deepEqual(saida.avisos, []);
  });

  test('U7: na reta final, a revisão só entra depois da data-alvo', () => {
    const { saida } = rodar('U7');
    assert.equal(notacao(saida.blocos), '11-13 #1:R; 11-16 #1:revx');
  });

  test('matéria que já tem REVISAO PENDENTE (fixada) não ganha outra', () => {
    const { entrada } = casos.find((c) => c.nome === 'U1');
    const blocos = entrada.blocos.map((b) => ({ ...b }));
    Object.assign(blocos[2], { tipo: 'REVISAO', topicoId: 'x', fixado: true });
    const saida = encaixarRevisoes({ ...entrada, blocos, topicos, estados: paraMap(entrada.estados) });
    assert.deepEqual(saida.blocos, blocos);
  });

  test('RESERVA fixada pelo aluno não é slot livre', () => {
    const { entrada } = casos.find((c) => c.nome === 'U1');
    const blocos = entrada.blocos.map((b) => ({ ...b }));
    blocos[0].fixado = true;
    const saida = encaixarRevisoes({ ...entrada, blocos, topicos, estados: paraMap(entrada.estados) });
    // O slot de hoje está fixado; o próximo livre é 11-16#2, e o estudo de 16/11 chega antes.
    assert.deepEqual(saida.blocos, blocos);
    assert.deepEqual(saida.avisos, []);
  });

  test('a ordem dos blocos na entrada não importa: os slots seguem data e ordem', () => {
    const { entrada, esperado } = casos.find((c) => c.nome === 'U3');
    const saida = encaixarRevisoes({
      ...entrada,
      blocos: [...entrada.blocos].reverse(),
      topicos,
      estados: paraMap(entrada.estados),
    });
    assert.deepEqual(saida.blocos, [...esperado.blocos].reverse());
  });

  test('não muta a entrada', () => {
    for (const { entrada } of casos) {
      const copia = structuredClone(entrada);
      encaixarRevisoes({ ...entrada, topicos, estados: paraMap(entrada.estados) });
      assert.deepEqual(entrada, copia);
    }
  });
});

describe('preencherReservaDeHoje', () => {
  const { topicos, casos } = carregarFixture('revisoes-reserva-de-hoje.json');

  function rodar(nome) {
    const { entrada, esperado } = casos.find((c) => c.nome === nome);
    const saida = preencherReservaDeHoje({ ...entrada, topicos, estados: paraMap(entrada.estados) });
    assert.deepEqual(saida, esperado, nome);
    return saida;
  }

  test('P1: revisão extra da mais esquecida sem bloco hoje; depois, estudo antecipado', () => {
    // x é a mais esquecida (4/3 contra 2/3 de y), mas já tem estudo hoje: a revisão extra vai
    // para y. No segundo slot não sobra matéria estudada, e entra o estudo antecipado de x, a
    // de maior prioridade. O slot de 16/11 não é de hoje e continua livre.
    assert.equal(notacao(rodar('P1')), '11-13 #1:revy* #2:x* #3:x; 11-16 #1:R');
  });

  test('P2: nada estudado; estudo antecipado por prioridade, e quem tem demanda 0 fica de fora', () => {
    assert.equal(notacao(rodar('P2')), '11-13 #1:x* #2:y* #3:R');
  });

  test('P3: matéria pulada hoje não recebe bloco extra hoje', () => {
    assert.equal(notacao(rodar('P3')), '11-13 #1:y[P] #2:x*');
  });

  test('sem slot livre hoje, devolve os mesmos blocos', () => {
    const { entrada } = casos.find((c) => c.nome === 'P1');
    const blocos = entrada.blocos.filter((b) => b.tipo !== 'RESERVA' || b.data !== '2026-11-13');
    const saida = preencherReservaDeHoje({ ...entrada, blocos, topicos, estados: paraMap(entrada.estados) });
    assert.deepEqual(saida, blocos);
  });

  test('não muta a entrada', () => {
    for (const { entrada } of casos) {
      const copia = structuredClone(entrada);
      preencherReservaDeHoje({ ...entrada, topicos, estados: paraMap(entrada.estados) });
      assert.deepEqual(entrada, copia);
    }
  });
});
