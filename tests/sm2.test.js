import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_INICIAL,
  QUALIDADE_POR_RESPOSTA,
  estadoDoTopico,
  estadosPeloHistorico,
  proximaRevisao,
} from '../js/core/sm2.js';
import { somarDias } from '../js/util/datas.js';
import { carregarFixture } from './carregar-fixture.js';

function numeros(estado) {
  return { efCentesimos: estado.efCentesimos, intervalo: estado.intervalo, repeticoes: estado.repeticoes };
}

describe('A: proximaRevisao, sequências a partir do estado inicial', () => {
  const { sequencias, casoInteiros } = carregarFixture('sm2-sequencias.json');

  for (const { respostas, passos } of sequencias) {
    test(`[${respostas.join(',')}]`, () => {
      let estado = ESTADO_INICIAL;
      respostas.forEach((qualidade, i) => {
        estado = proximaRevisao(estado, qualidade);
        const { conta, ...esperado } = passos[i];
        assert.deepEqual(estado, esperado, `passo ${i + 1}: ${conta}`);
      });
    });

    test(`[${respostas.join(',')}] pelo histórico, um dia por resposta, termina no mesmo estado`, () => {
      const blocos = respostas.map((qualidade, i) => ({
        id: i + 1,
        topicoId: 'a',
        tipo: 'ESTUDO',
        status: 'CONCLUIDO',
        concluidoEm: somarDias('2026-11-09', i),
        sequenciaConclusao: i + 1,
        qualidade,
      }));
      const estado = estadoDoTopico(blocos);
      const { conta, ...ultimo } = passos.at(-1);
      assert.deepEqual(numeros(estado), ultimo);
      assert.equal(estado.ultimaRevisao, somarDias('2026-11-09', respostas.length - 1));
      assert.equal(estado.proximaRevisao, somarDias(estado.ultimaRevisao, ultimo.intervalo));
    });
  }

  test('ef 194, intervalo 25, q 4 dá intervalo 49 (em ponto flutuante daria 48)', () => {
    assert.deepEqual(proximaRevisao(casoInteiros.estado, casoInteiros.qualidade), casoInteiros.esperado);

    // O mesmo caminho em ponto flutuante, para registrar por que o ef é inteiro: quatro respostas
    // 3 levam o ef de 2,5 a 1,9399999999999997, e 25 × ef arredonda para 48.
    let ef = 2.5;
    for (let i = 0; i < 4; i++) ef += 0.1 - 2 * (0.08 + 2 * 0.02);
    assert.equal(Math.round(25 * ef), 48);
  });

  test('não muta o estado recebido', () => {
    const estado = { efCentesimos: 260, intervalo: 3, repeticoes: 2 };
    proximaRevisao(estado, 5);
    assert.deepEqual(estado, { efCentesimos: 260, intervalo: 3, repeticoes: 2 });
  });

  test('qualidade fora de 0 a 5 ou não inteira lança RangeError', () => {
    for (const q of [-1, 6, 2.5, '5', null, undefined]) {
      assert.throws(() => proximaRevisao(ESTADO_INICIAL, q), RangeError, `qualidade ${q}`);
    }
  });

  test('QUALIDADE_POR_RESPOSTA (R15)', () => {
    assert.deepEqual({ ...QUALIDADE_POR_RESPOSTA }, {
      EXPLIQUEI_SEM_CONSULTAR: 5,
      ENTENDI_MAS_TRAVARIA: 3,
      NAO_ENTROU: 1,
    });
  });
});

describe('B: estado pelo histórico', () => {
  const fixture = carregarFixture('sm2-historico.json');

  for (const caso of fixture.estadoDoTopico) {
    test(caso.nome, () => {
      assert.deepEqual(estadoDoTopico(caso.blocos), caso.esperado);
    });
  }

  test('estadosPeloHistorico: cada matéria com o seu estado, sem as que não têm conclusão', () => {
    const { blocos, esperado } = fixture.estadosPeloHistorico;
    const estados = estadosPeloHistorico(blocos);
    assert.ok(estados instanceof Map);
    assert.deepEqual(Object.fromEntries(estados), esperado);
    assert.equal(estados.has('d'), false);
  });

  for (const caso of fixture.erros) {
    test(`erro: ${caso.nome}`, () => {
      assert.throws(() => estadoDoTopico(caso.blocos), RangeError);
      assert.throws(() => estadosPeloHistorico(caso.blocos), RangeError);
    });
  }

  test('a sequência é única no plano: repetida entre matérias diferentes também é erro', () => {
    const blocos = [
      { id: 1, topicoId: 'a', tipo: 'ESTUDO', status: 'CONCLUIDO', concluidoEm: '2026-11-09', sequenciaConclusao: 1, qualidade: 5 },
      { id: 2, topicoId: 'b', tipo: 'ESTUDO', status: 'CONCLUIDO', concluidoEm: '2026-11-09', sequenciaConclusao: 1, qualidade: 5 },
    ];
    assert.throws(() => estadosPeloHistorico(blocos), RangeError);
  });

  test('o estado inicial devolvido é uma cópia, e ESTADO_INICIAL não muda', () => {
    const estado = estadoDoTopico([]);
    estado.efCentesimos = 0;
    assert.equal(ESTADO_INICIAL.efCentesimos, 250);
    assert.ok(Object.isFrozen(ESTADO_INICIAL));
  });

  test('não muta nem reordena o array recebido', () => {
    const { blocos } = fixture.estadosPeloHistorico;
    const copia = structuredClone(blocos);
    estadosPeloHistorico(blocos);
    estadoDoTopico(blocos.filter((b) => b.topicoId === 'c'));
    assert.deepEqual(blocos, copia);
  });
});

describe('E: propriedades (500 casos aleatórios com semente fixa)', () => {
  // Gerador congruente linear (minstd de Park e Miller), o mesmo dos outros módulos. O produto fica
  // abaixo de 2^47, então a conta é exata em double, e o Java reproduz a sequência com long.
  function criarGerador(semente) {
    let estado = semente;
    return (min, max) => {
      estado = (estado * 48271) % 2147483647;
      return min + (estado % (max - min + 1));
    };
  }

  function embaralhar(array, sortear) {
    const copia = [...array];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = sortear(0, i);
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  const sortear = criarGerador(20261109);
  const STATUS_IGNORADOS = ['PENDENTE', 'PULADO', 'PERDIDO'];
  const casos = [];
  for (let c = 0; c < 500; c++) {
    const nDias = sortear(1, 10);
    const nMaterias = sortear(1, 4);
    const nConclusoes = sortear(1, 30);

    // Primeiro sorteia o dia de cada conclusão; depois numera em ordem de dia, porque a sequência
    // é crescente na ordem real das conclusões. Os saltos imitam conclusões de outras matérias
    // que não estão no caso.
    const conclusoes = [];
    for (let i = 0; i < nConclusoes; i++) {
      conclusoes.push({
        dia: sortear(0, nDias - 1),
        topicoId: `t${sortear(0, nMaterias - 1)}`,
        qualidade: sortear(0, 5),
        tipo: sortear(0, 1) === 0 ? 'ESTUDO' : 'REVISAO',
      });
    }
    conclusoes.sort((a, b) => a.dia - b.dia);
    let sequencia = 0;
    const blocos = conclusoes.map((conclusao) => {
      sequencia += sortear(1, 3);
      return {
        topicoId: conclusao.topicoId,
        tipo: conclusao.tipo,
        status: 'CONCLUIDO',
        concluidoEm: somarDias('2026-11-09', conclusao.dia),
        sequenciaConclusao: sequencia,
        qualidade: conclusao.qualidade,
      };
    });

    // Ruído: blocos que não contam, com qualidade e data para provar que são ignorados.
    const nRuido = sortear(0, 5);
    for (let i = 0; i < nRuido; i++) {
      blocos.push({
        topicoId: `t${sortear(0, nMaterias - 1)}`,
        tipo: 'ESTUDO',
        status: STATUS_IGNORADOS[sortear(0, 2)],
        concluidoEm: somarDias('2026-11-09', sortear(0, nDias - 1)),
        sequenciaConclusao: 1000 + i,
        qualidade: 0,
      });
    }

    // Ids numa ordem que não tem nada a ver com a das conclusões.
    const ids = embaralhar(blocos.map((_, i) => i + 1), sortear);
    blocos.forEach((bloco, i) => { bloco.id = ids[i]; });
    casos.push({ blocos, embaralhado: embaralhar(blocos, sortear) });
  }

  test('embaralhar a ordem do array de blocos não muda os estados', () => {
    for (const { blocos, embaralhado } of casos) {
      assert.deepEqual(estadosPeloHistorico(embaralhado), estadosPeloHistorico(blocos));
    }
  });

  test('estadosPeloHistorico dá, para cada matéria, o mesmo que estadoDoTopico só com os blocos dela', () => {
    for (const { blocos } of casos) {
      const estados = estadosPeloHistorico(blocos);
      const materias = new Set(blocos.map((b) => b.topicoId));
      for (const topicoId of materias) {
        const sozinho = estadoDoTopico(blocos.filter((b) => b.topicoId === topicoId));
        const temConclusao = blocos.some((b) => b.topicoId === topicoId && b.status === 'CONCLUIDO');
        if (temConclusao) {
          assert.deepEqual(estados.get(topicoId), sozinho);
        } else {
          assert.equal(estados.has(topicoId), false);
          assert.deepEqual(sozinho, { ...ESTADO_INICIAL });
        }
      }
    }
  });

  test('ef entre 130 e 250 + 10·(dias com conclusão), intervalo ≥ 1 e proximaRevisao > ultimaRevisao', () => {
    for (const { blocos } of casos) {
      for (const [topicoId, estado] of estadosPeloHistorico(blocos)) {
        const dias = new Set(
          blocos.filter((b) => b.topicoId === topicoId && b.status === 'CONCLUIDO').map((b) => b.concluidoEm),
        );
        assert.ok(estado.efCentesimos >= 130, `ef ${estado.efCentesimos} abaixo de 130`);
        assert.ok(estado.efCentesimos <= 250 + 10 * dias.size, `ef ${estado.efCentesimos} com ${dias.size} dias`);
        assert.ok(estado.intervalo >= 1);
        assert.ok(estado.proximaRevisao > estado.ultimaRevisao);
        assert.ok(Number.isInteger(estado.efCentesimos) && Number.isInteger(estado.intervalo));
      }
    }
  });
});
