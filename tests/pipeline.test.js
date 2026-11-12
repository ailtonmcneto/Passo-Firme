import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gerarCronograma, montarFuturo } from '../js/core/pipeline.js';
import { carregarFixture } from './carregar-fixture.js';
import { notacao } from './notacao.js';

// Cada fixture guarda a entrada e a saída completas (é o que o porte em Java vai reproduzir).
// Os testes conferem a saída inteira e, por cima, os números e a notação do cenário, para
// quem lê não precisar abrir o JSON.
function rodar(nome) {
  const { entrada, esperado } = carregarFixture(nome);
  const saida = gerarCronograma(entrada);
  assert.deepEqual(saida, esperado);
  return { entrada, saida };
}

function alocados(saida) {
  return Object.fromEntries(saida.topicos.map((t) => [t.id, t.blocosAlocados]));
}

describe('gerarCronograma: cenários', () => {
  test('A: geração inicial', () => {
    const { saida } = rodar('pipeline-a-geracao-inicial.json');
    const { viabilidade } = saida;

    assert.equal(saida.bloqueado, false);
    // Inviável (17 para 14), mas não bloqueante: o plano é gerado com o que cabe.
    assert.equal(viabilidade.viavel, false);
    assert.equal(viabilidade.bloqueante, false);
    assert.equal(viabilidade.capacidadeEstudo, 14);
    assert.equal(viabilidade.demandaTotal, 17);
    assert.equal(viabilidade.deficit, 3);
    assert.deepEqual(viabilidade.cobertura, { percentual: 82 });
    assert.equal(saida.cobertura, 'NAO_SE_APLICA');
    assert.equal(saida.retaFinal, null);
    assert.deepEqual(saida.avisos, []);
    assert.deepEqual(alocados(saida), { a: 5, b: 4, c: 3, d: 2 });

    assert.equal(
      notacao(saida.blocos),
      '11-09 #1:a #2:b; 11-10 #1:R #2:c; 11-11 #1:d #2:a #3:b #4:R; 11-12 #1:c #2:a; 11-13 #1:b; '
        + '11-16 #1:R #2:a; 11-17 #1:d #2:c; 11-19 #1:b #2:R; 11-20 #1:a',
    );
    assert.ok(saida.blocos.every((b) => b.status === 'PENDENTE' && b.extra === false && b.fixado === false));
    assert.ok(saida.blocos.every((b) => !('id' in b)));

    // São exatamente os blocos do sequenciador, com os campos que o pipeline acrescenta.
    const { esperado } = carregarFixture('sequenciador-duas-semanas.json');
    const semAcrescimos = saida.blocos.map(({ status, extra, fixado, motivo, ...bloco }) => bloco);
    assert.deepEqual(semAcrescimos, esperado.blocos);

    const motivoDe = (id) => saida.blocos.find((b) => b.topicoId === id).motivo;
    assert.equal(motivoDe('a'), 'peso alto, domínio baixo');
    assert.equal(motivoDe('c'), 'peso baixo, domínio baixo');
    assert.equal(motivoDe('d'), 'peso baixo, domínio médio');
    assert.equal(motivoDe(null), 'horário livre');
  });

  test('G (criação): com avaliação, a reserva de hoje vira estudo antecipado', () => {
    const { saida } = rodar('pipeline-g-com-avaliacao.json');
    assert.deepEqual(alocados(saida), { a: 3, b: 2, c: 2, d: 1 });
    // 11-09#2 era RESERVA; como é de hoje e nada foi estudado, vira estudo antecipado de a.
    // Depois da prova (13/11), todos os slots são RESERVA.
    assert.equal(
      notacao(saida.blocos),
      '11-09 #1:a #2:a*; 11-10 #1:b #2:c; 11-11 #1:d #2:a #3:R #4:b; 11-12 #1:c #2:a; 11-13 #1:R; '
        + '11-16 #1:R #2:R; 11-17 #1:R #2:R; 11-19 #1:R #2:R; 11-20 #1:R',
    );
  });

  describe('I: criação bloqueada (R16)', () => {
    const { casos } = carregarFixture('pipeline-i-criacao-bloqueada.json');
    const gerar = (i) => {
      const saida = gerarCronograma(casos[i].entrada);
      assert.deepEqual(saida, casos[i].esperado);
      return saida;
    };

    test('3 matérias para 2 blocos: bloqueado, sem blocos, com a reta final oferecida', () => {
      const saida = gerar(0);
      assert.equal(saida.bloqueado, true);
      assert.deepEqual(saida.blocos, []);
      assert.deepEqual(saida.avisos, []);
      assert.equal(saida.cobertura, 'PERGUNTAR');
      assert.deepEqual(saida.retaFinal, {
        capacidadeEstudo: 3,
        demandaTotal: 11,
        cobertura: { percentual: 27 },
        bloqueante: false,
      });
      // As matérias voltam como vieram, sem blocosAlocados: nada foi alocado.
      assert.deepEqual(saida.topicos, casos[0].entrada.topicos);
    });

    test('reduzirDemanda não resolve: nenhuma matéria baixa de 1 (§4)', () => {
      const saida = gerar(1);
      assert.equal(saida.bloqueado, true);
      assert.deepEqual(saida.blocos, []);
      assert.equal(saida.viabilidade.demandaTotal, 3);
      assert.equal(saida.viabilidade.bloqueante, true);
    });

    test('reta final aceita: a reserva vira estudo e cada matéria ganha um bloco', () => {
      const saida = gerar(2);
      assert.equal(saida.bloqueado, false);
      assert.equal(saida.cobertura, 'ATIVA');
      assert.deepEqual(alocados(saida), { X: 1, Y: 1, Z: 1 });
      assert.equal(notacao(saida.blocos), '11-09 #1:X; 11-10 #1:Y; 11-11 #1:Z');
    });
  });

  test('J: reduzirDemanda na criação', () => {
    const { saida } = rodar('pipeline-j-reduzir-demanda.json');
    assert.equal(saida.bloqueado, false);
    assert.equal(saida.viabilidade.viavel, true);
    assert.deepEqual(saida.viabilidade.cobertura, { percentual: 100 });
    // O "depois" da escapatória: d cai de 3 para 1 e c de 5 para 4, fechando o déficit de 3.
    assert.deepEqual(alocados(saida), { a: 5, b: 4, c: 4, d: 1 });
    // A demandaRestante era só desta geração; o que fica gravado é blocosAlocados.
    assert.ok(saida.topicos.every((t) => !('demandaRestante' in t)));
    assert.equal(
      notacao(saida.blocos),
      '11-09 #1:a #2:b; 11-10 #1:c #2:R; 11-11 #1:a #2:b #3:c #4:R; 11-12 #1:d #2:a; 11-13 #1:b; '
        + '11-16 #1:c #2:R; 11-17 #1:a #2:b; 11-19 #1:c #2:R; 11-20 #1:a',
    );
  });

  test('L: criação com início no passado começa em hoje', () => {
    const { saida } = rodar('pipeline-l-inicio-no-passado.json');
    assert.ok(saida.blocos.every((b) => b.data >= '2026-11-11'));
    assert.equal(saida.viabilidade.capacidadeEstudo, 11);
    assert.equal(saida.viabilidade.demandaTotal, 17);
    assert.deepEqual(saida.viabilidade.cobertura, { percentual: 64 });
    assert.deepEqual(alocados(saida), { a: 4, b: 3, c: 2, d: 2 });
    assert.equal(
      notacao(saida.blocos),
      '11-11 #1:a #2:b #3:a* #4:c; 11-12 #1:d #2:a; 11-13 #1:b; 11-16 #1:R #2:a; 11-17 #1:c #2:d; '
        + '11-19 #1:b #2:R; 11-20 #1:a',
    );
  });
});

describe('gerarCronograma: regras', () => {
  const { entrada } = carregarFixture('pipeline-a-geracao-inicial.json');

  test('fim antes de hoje lança RangeError', () => {
    assert.throws(() => gerarCronograma({ ...entrada, hoje: '2026-11-23' }), RangeError);
  });

  test('criar no último dia do plano ainda vale', () => {
    // 22/11 é domingo, sem horário: nenhum bloco, e todas as matérias ficam de fora.
    const saida = gerarCronograma({ ...entrada, hoje: '2026-11-22' });
    assert.equal(saida.bloqueado, true);
  });

  test('plano inválido lança RangeError (validarPlano)', () => {
    const plano = { ...entrada.plano, dataAvaliacao: '2026-12-01' };
    assert.throws(() => gerarCronograma({ ...entrada, plano }), RangeError);
  });

  test('reduzirDemanda num plano que já cabe não muda nada', () => {
    const topicos = entrada.topicos.slice(0, 2);
    const normal = gerarCronograma({ ...entrada, topicos });
    assert.equal(normal.viabilidade.viavel, true);
    assert.deepEqual(gerarCronograma({ ...entrada, topicos, reduzirDemanda: true }), normal);
  });

  test('a mesma entrada dá a mesma saída e não é alterada', () => {
    const copia = structuredClone(entrada);
    const primeira = gerarCronograma(entrada);
    assert.deepEqual(gerarCronograma(entrada), primeira);
    assert.deepEqual(entrada, copia);
  });
});

describe('montarFuturo', () => {
  const { entrada } = carregarFixture('pipeline-a-geracao-inicial.json');

  test('devolve a alocação e os avisos da alocação antes dos das revisões', () => {
    const futuro = montarFuturo({ ...entrada });
    assert.deepEqual(futuro.alocacao.blocos, { a: 5, b: 4, c: 3, d: 2 });
    assert.deepEqual(futuro.avisos, []);
  });

  test('os blocos saem em ordem de data e ordem, com os mantidos no meio', () => {
    const mantido = {
      id: 7, data: '2026-11-11', ordem: 2, topicoId: 'a', tipo: 'ESTUDO', duracaoMin: 30,
      status: 'PENDENTE', extra: false, fixado: true, motivo: 'peso alto, domínio baixo',
    };
    const { blocos } = montarFuturo({ ...entrada, mantidos: [mantido] });
    const quarta = blocos.filter((b) => b.data === '2026-11-11');
    assert.deepEqual(quarta.map((b) => b.ordem), [1, 2, 3, 4]);
    // O mantido é o mesmo objeto: o pipeline não o copia nem reescreve o motivo.
    assert.equal(quarta[1], mantido);
    assert.equal(blocos.length, 18);
  });
});
