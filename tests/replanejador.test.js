import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replanejar, calcularDemandaRestante } from '../js/core/replanejador.js';
import { gerarCronograma } from '../js/core/pipeline.js';
import { calcularCapacidade } from '../js/core/capacidade.js';
import { estadosPeloHistorico } from '../js/core/sm2.js';
import { aplicarAjusteDominio } from '../js/core/estimador.js';
import { dataAlvo } from '../js/core/cobertura.js';
import { somarDias } from '../js/util/datas.js';
import { carregarFixture } from './carregar-fixture.js';
import { notacao, alocacaoNosBlocos } from './notacao.js';

// Cada fixture guarda a entrada completa, a demanda restante de cada matéria e a saída
// completa. O teste confere tudo isso e, por cima, os números e a notação do cenário.
function rodar(nome) {
  const { entrada, demandaRestante, esperado } = carregarFixture(nome);
  const saida = replanejar(entrada);
  assert.deepEqual(saida, esperado);

  const restante = Object.fromEntries(calcularDemandaRestante(entrada).map((t) => [t.id, t.demandaRestante]));
  assert.deepEqual(restante, demandaRestante);

  const ids = entrada.topicos.map((t) => t.id);
  return { entrada, saida, restante, alocacao: alocacaoNosBlocos(saida.blocosFuturos, ids) };
}

// "280/8/3 (próxima 11-20)" → o estado do SM-2 de uma matéria, para comparar numa linha.
function resumoDosEstados(blocos) {
  const resumo = {};
  for (const [id, e] of estadosPeloHistorico(blocos)) {
    resumo[id] = `${e.efCentesimos}/${e.intervalo}/${e.repeticoes} ${e.proximaRevisao.slice(5)}`;
  }
  return resumo;
}

// Capacidade que o replanejamento enxerga: de hoje em diante, sem os slots dos mantidos.
function capacidadeSemMantidos({ plano, hoje }, saida) {
  const ocupados = saida.blocosFuturos.filter((b) => b.id !== undefined).map(({ data, ordem }) => ({ data, ordem }));
  return calcularCapacidade({ ...plano, inicio: hoje, ocupados });
}

const A = carregarFixture('pipeline-a-geracao-inicial.json');
const blocosDeA = A.esperado.blocos.map((b, i) => ({ id: i + 1, ...b }));
const idDe = (data, ordem) => blocosDeA.find((b) => b.data === data && b.ordem === ordem).id;

describe('replanejar: cenários', () => {
  test('B: perdeu 3 blocos', () => {
    const { entrada, saida, restante, alocacao } = rodar('replanejar-b-perdeu-tres.json');
    // O ponto de partida é a saída do cenário A, com ids 1, 2, 3… na ordem dos blocos.
    assert.deepEqual(entrada.blocos, blocosDeA);
    assert.deepEqual(entrada.topicos, A.esperado.topicos);

    // A RESERVA de 10/11 não era tarefa e não entra nos perdidos.
    assert.deepEqual(saida.perdidos, [idDe('2026-11-09', 1), idDe('2026-11-09', 2), idDe('2026-11-10', 2)]);
    // Nada foi estudado: tudo o que a alocação prometeu continua faltando.
    assert.deepEqual(restante, { a: 5, b: 4, c: 3, d: 2 });

    const { viabilidade } = saida;
    assert.equal(viabilidade.capacidadeEstudo, 11);
    assert.equal(viabilidade.demandaTotal, 14);
    assert.equal(viabilidade.viavel, false);
    assert.deepEqual(viabilidade.cobertura, { percentual: 78 });

    // Os mesmos números do caso H do alocador.
    assert.deepEqual(alocacao, carregarFixture('alocador-h-replanejamento.json').esperado.blocos);
    assert.deepEqual(alocacao, { a: 4, b: 3, c: 2, d: 2 });

    assert.equal(
      notacao(saida.blocosFuturos),
      '11-11 #1:a #2:b #3:a* #4:c; 11-12 #1:d #2:a; 11-13 #1:b; 11-16 #1:R #2:a; 11-17 #1:c #2:d; '
        + '11-19 #1:b #2:R; 11-20 #1:a',
    );
    // 11-11#3 era RESERVA de hoje e nada foi estudado: vira estudo antecipado de a.
    const extra = saida.blocosFuturos.find((b) => b.extra);
    assert.equal(
      extra.motivo,
      'estudo antecipado: sobrou tempo hoje e a é a matéria de maior prioridade que ainda falta',
    );
    assert.ok(saida.blocosFuturos.every((b) => b.tipo !== 'REVISAO'));
    // Todos os blocos são novos: a fachada é quem dá os ids.
    assert.ok(saida.blocosFuturos.every((b) => !('id' in b)));
  });

  test('C: aluno em dia (C5 refinado)', () => {
    const { entrada, saida, restante } = rodar('replanejar-c-em-dia.json');
    assert.deepEqual(resumoDosEstados(entrada.blocos), {
      a: '280/8/3 11-20',
      b: '270/3/2 11-14',
      c: '270/3/2 11-15',
      d: '260/1/1 11-12',
    });
    assert.deepEqual(saida.perdidos, []);
    assert.deepEqual(restante, { a: 2, b: 2, c: 1, d: 1 });
    assert.equal(saida.viabilidade.capacidadeEstudo, 6);
    assert.equal(saida.viabilidade.demandaTotal, 6);
    assert.equal(saida.viabilidade.viavel, true);
    assert.deepEqual(saida.viabilidade.cobertura, { percentual: 100 });

    // Este é o caso do C5 refinado. O que decide se a revisão é necessária é o slot em que
    // ela cairia, e não a data em que venceu:
    // - d venceu em 12/11 (atrasada, devida hoje). A primeira reserva livre é 11-16#2, e o
    //   próximo estudo de d só vem em 17/11, depois do slot: a revisão é agendada.
    // - b venceu em 14/11 e c em 15/11, mas com 11-16#2 já usada a próxima reserva livre é
    //   20/11. Os estudos de b (16/11) e de c (17/11) chegam antes disso e já fazem o papel
    //   da revisão. Pela regra antiga (estudo até a data devida), as duas pediriam revisão e
    //   disputariam a reserva com um estudo marcado para um ou dois dias depois.
    // - a vence em 20/11, e o slot de 20/11 está livre, mas a tem estudo hoje e em 19/11.
    assert.equal(
      notacao(saida.blocosFuturos),
      '11-13 #1:a; 11-16 #1:b #2:revd; 11-17 #1:c #2:d; 11-19 #1:a #2:b; 11-20 #1:R',
    );
    const revisao = saida.blocosFuturos.find((b) => b.tipo === 'REVISAO');
    assert.equal(revisao.motivo, 'não revisado há 5 dias');
    assert.deepEqual(saida.avisos, []);
  });

  test('D: mesmo dia, um concluído e um pulado', () => {
    const { entrada, saida, restante, alocacao } = rodar('replanejar-d-mesmo-dia.json');
    // Os dois blocos de hoje ficam como estão, no mesmo slot.
    assert.deepEqual(saida.blocosFuturos.slice(0, 2), entrada.blocos.slice(0, 2));

    const capacidade = capacidadeSemMantidos(entrada, saida);
    assert.equal(capacidade.capacidadeTotal, 16);
    assert.equal(capacidade.capacidadeEstudo, 12);

    // O concluído desconta da demanda de a; o pulado de b volta como demanda.
    assert.deepEqual(restante, { a: 4, b: 4, c: 3, d: 2 });
    assert.equal(saida.viabilidade.demandaTotal, 13);
    assert.equal(saida.viabilidade.deficit, 1);
    assert.deepEqual(saida.viabilidade.cobertura, { percentual: 92 });
    assert.deepEqual(alocacao, { a: 4, b: 4, c: 3, d: 1 });

    // Sem revisão de a: o estudo de a em 10/11 vem antes da primeira reserva livre (11/11).
    assert.equal(
      notacao(saida.blocosFuturos),
      '11-09 #1:a[C] #2:b[P]; 11-10 #1:a #2:b; 11-11 #1:R #2:c #3:a #4:b; 11-12 #1:R #2:d; 11-13 #1:c; '
        + '11-16 #1:a #2:b; 11-17 #1:R #2:c; 11-19 #1:a #2:b; 11-20 #1:R',
    );
  });

  test('E: sumiu 10 dias', () => {
    const { saida, restante, alocacao } = rodar('replanejar-e-sumiu.json');
    // Os 11 ESTUDO de 09 a 17/11 que não foram feitos; as RESERVA ficam de fora.
    assert.deepEqual(saida.perdidos, [
      idDe('2026-11-09', 2), idDe('2026-11-10', 2), idDe('2026-11-11', 1), idDe('2026-11-11', 2),
      idDe('2026-11-11', 3), idDe('2026-11-12', 1), idDe('2026-11-12', 2), idDe('2026-11-13', 1),
      idDe('2026-11-16', 2), idDe('2026-11-17', 1), idDe('2026-11-17', 2),
    ]);
    assert.deepEqual(restante, { a: 4, b: 4, c: 3, d: 2 });

    // Números honestos: sobram 2 blocos de estudo para 13 de demanda.
    const { viabilidade } = saida;
    assert.equal(viabilidade.capacidadeEstudo, 2);
    assert.equal(viabilidade.demandaTotal, 13);
    assert.equal(viabilidade.deficit, 11);
    assert.deepEqual(viabilidade.cobertura, { percentual: 15 });
    assert.equal(viabilidade.bloqueante, true);
    assert.deepEqual(viabilidade.escapatorias.maisTempo, { minutosPorDia: 150, diasAMais: 9, novoFim: '2026-12-01' });

    // Faltam 3 dias e não cabe: a reta final é oferecida, não ligada.
    assert.equal(saida.cobertura, 'PERGUNTAR');
    assert.deepEqual(saida.retaFinal, {
      capacidadeEstudo: 3,
      demandaTotal: 13,
      cobertura: { percentual: 23 },
      bloqueante: true,
    });

    // O replanejamento nunca bloqueia: sai o que cabe, com o aviso de quem ficou de fora.
    assert.deepEqual(alocacao, { a: 1, b: 1, c: 0, d: 0 });
    assert.deepEqual(saida.avisos, [
      { id: 'c', tipo: 'TOPICO_SEM_BLOCO' },
      { id: 'd', tipo: 'TOPICO_SEM_BLOCO' },
    ]);
    // Sem revisão de a: o estudo de hoje cumpre o papel.
    assert.equal(notacao(saida.blocosFuturos), '11-19 #1:a #2:b; 11-20 #1:R');
  });

  test('E2: sumiu 10 dias, com a reta final aceita', () => {
    const { saida, alocacao } = rodar('replanejar-e2-sumiu-reta-final.json');
    assert.equal(saida.cobertura, 'ATIVA');
    assert.deepEqual(alocacao, { a: 1, b: 1, c: 1, d: 0 });
    assert.deepEqual(saida.avisos, [{ id: 'd', tipo: 'TOPICO_SEM_BLOCO' }]);
    assert.equal(notacao(saida.blocosFuturos), '11-19 #1:a #2:b; 11-20 #1:c');
  });

  test('F: terminou antes do prazo', () => {
    const { entrada, saida, restante, alocacao } = rodar('replanejar-f-terminou-antes.json');
    const concluidos = entrada.blocos.filter((b) => b.status === 'CONCLUIDO');
    assert.equal(concluidos.length, 14);
    assert.ok(concluidos.every((b) => b.tipo === 'ESTUDO'));

    assert.deepEqual(resumoDosEstados(entrada.blocos), {
      a: '266/21/4 12-08',
      b: '266/21/4 12-07',
      c: '280/8/3 11-24',
      d: '260/1/0 11-18',
    });
    assert.deepEqual(restante, { a: 0, b: 0, c: 0, d: 0 });
    assert.equal(saida.viabilidade.viavel, true);
    assert.deepEqual(saida.viabilidade.cobertura, { percentual: 100 });
    assert.deepEqual(alocacao, { a: 0, b: 0, c: 0, d: 0 });

    // Todos os slots viram RESERVA (os 2 de estudo voltam como sobra), e a reserva recebe:
    // - a revisão de d, a única devida (venceu em 18/11); as de a, b e c vencem depois do fim;
    // - no outro slot de hoje, a revisão extra de c, a de menor retenção entre a, b e c
    //   (3 dias sobre intervalo 8, contra 3/21 de b e 2/21 de a).
    assert.equal(notacao(saida.blocosFuturos), '11-19 #1:revd #2:revc*; 11-20 #1:R');
    assert.equal(saida.blocosFuturos[0].motivo, 'não revisado há 2 dias');
    assert.equal(saida.blocosFuturos[1].motivo, 'revisão extra: c é o assunto que você estudou há mais tempo');
    assert.deepEqual(saida.avisos, []);
    // Decisão da fixture: o ESTUDO de c de 11-12#1 não foi feito, e é o único perdido.
    assert.deepEqual(saida.perdidos, [idDe('2026-11-12', 1)]);
  });

  test('G: prova perto', () => {
    const { entrada, saida, alocacao } = rodar('replanejar-g-prova-perto.json');
    // O ponto de partida é a criação com avaliação, cuja alocação virou blocosAlocados.
    const criacao = carregarFixture('pipeline-g-com-avaliacao.json').esperado;
    assert.deepEqual(entrada.blocos, criacao.blocos.map((b, i) => ({ id: i + 1, ...b })));
    assert.deepEqual(entrada.topicos, criacao.topicos);

    // Os 4 ESTUDO de 09 e 10/11 (um deles é o estudo antecipado de 11-09#2).
    assert.deepEqual(saida.perdidos, [1, 2, 3, 4]);
    const { viabilidade } = saida;
    assert.equal(viabilidade.capacidadeEstudo, 5);
    assert.equal(viabilidade.demandaTotal, 8);
    assert.equal(viabilidade.deficit, 3);
    assert.deepEqual(viabilidade.cobertura, { percentual: 62 });

    assert.equal(saida.cobertura, 'PERGUNTAR');
    assert.deepEqual(saida.retaFinal, {
      capacidadeEstudo: 7,
      demandaTotal: 8,
      cobertura: { percentual: 87 },
      bloqueante: false,
    });
    assert.deepEqual(alocacao, { a: 2, b: 1, c: 1, d: 1 });
    assert.equal(
      notacao(saida.blocosFuturos),
      '11-11 #1:a #2:a* #3:b #4:c; 11-12 #1:d #2:a; 11-13 #1:R; '
        + '11-16 #1:R #2:R; 11-17 #1:R #2:R; 11-19 #1:R #2:R; 11-20 #1:R',
    );
  });

  test('G2: prova perto, com a reta final aceita', () => {
    const { saida, alocacao } = rodar('replanejar-g2-prova-perto-reta-final.json');
    assert.equal(saida.cobertura, 'ATIVA');
    assert.deepEqual(alocacao, { a: 2, b: 2, c: 2, d: 1 });
    // Revezamento na ordem canônica até a prova; depois dela, só reserva.
    assert.equal(
      notacao(saida.blocosFuturos),
      '11-11 #1:a #2:b #3:c #4:d; 11-12 #1:a #2:b; 11-13 #1:c; '
        + '11-16 #1:R #2:R; 11-17 #1:R #2:R; 11-19 #1:R #2:R; 11-20 #1:R',
    );
    assert.ok(saida.blocosFuturos.every((b) => b.tipo !== 'REVISAO' && b.extra === false));
  });

  test('H: bloco fixado', () => {
    const { entrada, saida, restante } = rodar('replanejar-h-bloco-fixado.json');
    const fixado = entrada.blocos.find((b) => b.fixado);
    assert.equal(fixado.id, idDe('2026-11-17', 1));

    // O fixado já tem lugar marcado, então conta na demanda de d e tira o slot da capacidade.
    assert.deepEqual(restante, { a: 5, b: 4, c: 3, d: 1 });
    assert.equal(capacidadeSemMantidos(entrada, saida).capacidadeEstudo, 13);
    assert.equal(saida.viabilidade.viavel, true);

    assert.equal(
      notacao(saida.blocosFuturos),
      '11-09 #1:a #2:b; 11-10 #1:R #2:c; 11-11 #1:a #2:b #3:R #4:d; 11-12 #1:d[F] #2:c; 11-13 #1:a; '
        + '11-16 #1:b #2:R; 11-17 #1:a #2:c; 11-19 #1:b #2:R; 11-20 #1:a',
    );
    // O fixado sai igual, com o mesmo id, e o bloco novo do dia fica na posição real do slot livre.
    const quinta = saida.blocosFuturos.filter((b) => b.data === '2026-11-12');
    assert.deepEqual(quinta[0], fixado);
    assert.equal(quinta[1].ordem, 2);
    assert.equal(quinta[1].id, undefined);
  });

  test('K: ajuste de domínio aceito', () => {
    const { entrada, saida, restante, alocacao } = rodar('replanejar-k-ajuste-dominio.json');
    const b = A.esperado.topicos.find((t) => t.id === 'b');
    const ajustado = aplicarAjusteDominio(b, 1, []);
    assert.equal(ajustado.blocosAlocados, 5);
    assert.deepEqual(entrada.topicos.find((t) => t.id === 'b'), ajustado);

    assert.deepEqual(restante, { a: 5, b: 5, c: 3, d: 2 });
    assert.equal(saida.viabilidade.demandaTotal, 15);
    assert.equal(saida.viabilidade.deficit, 1);
    assert.deepEqual(saida.viabilidade.cobertura, { percentual: 93 });

    // O plano já estava cheio (14 blocos de estudo, todos alocados), então o bloco a mais que
    // b passou a pedir não tem de onde sair: a alocação e os blocos continuam os de A. O
    // ajuste não some: aparece como déficit honesto (15 para 14) e nas escapatórias, e é o
    // aluno quem decide se quer mais tempo ou menos matéria.
    assert.deepEqual(alocacao, { a: 5, b: 4, c: 3, d: 2 });
    assert.deepEqual(saida.blocosFuturos, A.esperado.blocos);
    assert.notEqual(saida.viabilidade.escapatorias, null);
  });

  test('L: criar com início no passado dá o mesmo futuro que replanejar (cenário B)', () => {
    const criacao = carregarFixture('pipeline-l-inicio-no-passado.json').esperado;
    const b = carregarFixture('replanejar-b-perdeu-tres.json').esperado;
    assert.deepEqual(criacao.blocos, b.blocosFuturos);
  });

  test('M: depois do fim', () => {
    const { saida } = rodar('replanejar-m-depois-do-fim.json');
    assert.deepEqual(saida.blocosFuturos, []);
    assert.equal(saida.viabilidade, null);
    assert.equal(saida.retaFinal, null);
    assert.equal(saida.cobertura, 'NAO_SE_APLICA');
    assert.deepEqual(saida.avisos, []);
    // Os 14 ESTUDO de A; as 4 RESERVA não entram.
    assert.equal(saida.perdidos.length, 14);
    assert.deepEqual(saida.perdidos, blocosDeA.filter((b) => b.tipo === 'ESTUDO').map((b) => b.id));
  });
});

describe('replanejar: regras', () => {
  const { entrada } = carregarFixture('replanejar-d-mesmo-dia.json');

  test('no último dia do plano ainda monta o futuro', () => {
    const saida = replanejar({ ...entrada, hoje: '2026-11-22' });
    assert.notEqual(saida.viabilidade, null);
    assert.deepEqual(saida.blocosFuturos, []);
  });

  test('matéria sem blocosAlocados (adicionada depois) usa a demanda do cadastro', () => {
    const nova = { id: 'e', nome: 'e', peso: 3, dominio: 2 };
    const manual = { id: 'f', nome: 'f', peso: 3, dominio: 2, blocosDesejados: 7 };
    const restante = calcularDemandaRestante({ ...entrada, topicos: [...entrada.topicos, nova, manual] });
    assert.equal(restante.find((t) => t.id === 'e').demandaRestante, 4);
    assert.equal(restante.find((t) => t.id === 'f').demandaRestante, 7);
  });

  test('a demanda restante nunca fica negativa', () => {
    const topicos = entrada.topicos.map((t) => ({ ...t, blocosAlocados: 0 }));
    const restante = calcularDemandaRestante({ ...entrada, topicos });
    assert.ok(restante.every((t) => t.demandaRestante === 0));
  });

  test('REVISAO concluída não desconta da demanda; só ESTUDO', () => {
    const blocos = entrada.blocos.map((b) => (b.id === 1 ? { ...b, tipo: 'REVISAO' } : b));
    const restante = calcularDemandaRestante({ ...entrada, blocos });
    assert.equal(restante.find((t) => t.id === 'a').demandaRestante, 5);
  });

  test('não sobrescreve blocosAlocados nem altera a entrada', () => {
    const copia = structuredClone(entrada);
    replanejar(entrada);
    assert.deepEqual(entrada, copia);
  });
});

// Gerador congruencial linear (constantes do Numerical Recipes) com semente fixa, como nos
// módulos anteriores: os casos parecem aleatórios mas são sempre os mesmos.
function criarGerador(semente) {
  let estado = semente >>> 0;
  return (n) => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return (estado >>> 16) % n;
  };
}

const INICIO = '2026-11-09';
const MINUTOS = [0, 25, 30, 60, 90, 140];
const QUALIDADES = [1, 3, 5];

// Um plano criado em 09/11 e depois usado até um dia qualquer: blocos concluídos ou pulados
// ao acaso e alguns estudos futuros fixados. Devolve null quando a criação é bloqueada.
function gerarCaso(sortear) {
  const disponibilidade = {};
  for (let dia = 0; dia <= 6; dia++) disponibilidade[dia] = MINUTOS[sortear(MINUTOS.length)];
  const duracao = 3 + sortear(20);
  const plano = { inicio: INICIO, fim: somarDias(INICIO, duracao), disponibilidade };
  if (sortear(4) === 0) plano.dataAvaliacao = somarDias(INICIO, sortear(duracao + 1));

  const topicos = [];
  const quantidade = 1 + sortear(5);
  for (let i = 0; i < quantidade; i++) {
    const t = { id: `t${i}`, nome: `Matéria ${i}`, peso: 1 + sortear(5), dominio: 1 + sortear(5) };
    if (sortear(4) === 0) t.blocosDesejados = 1 + sortear(8);
    topicos.push(t);
  }

  const criacao = gerarCronograma({ plano, topicos, hoje: INICIO });
  if (criacao.bloqueado) return null;

  // Às vezes passa do fim, para exercitar também o "depois do fim".
  const hoje = somarDias(INICIO, sortear(duracao + 3));
  // Em 1/3 dos casos o aluno já aceitou a reta final para a prova atual.
  if (sortear(3) === 0) plano.respostaCobertura = { resposta: 'ACEITO', dataAlvo: dataAlvo(plano) };

  let sequencia = 0;
  const blocos = criacao.blocos.map((bloco, i) => {
    const b = { id: i + 1, ...bloco };
    if (b.tipo === 'RESERVA') return b;

    // Os blocos de hoje também podem já ter sido feitos ou pulados: são os mantidos.
    if (b.data <= hoje) {
      const acao = sortear(b.data === hoje ? 4 : 3);
      if (acao === 0) {
        return {
          ...b,
          status: 'CONCLUIDO',
          qualidade: QUALIDADES[sortear(3)],
          concluidoEm: b.data,
          sequenciaConclusao: ++sequencia,
        };
      }
      if (acao === 1) return { ...b, status: 'PULADO' };
      return b;
    }
    return sortear(6) === 0 ? { ...b, fixado: true } : b;
  });

  return { plano, topicos: criacao.topicos, blocos, hoje };
}

describe('replanejar: propriedades', () => {
  const sortear = criarGerador(20261111);
  const casos = [];
  while (casos.length < 300) {
    const caso = gerarCaso(sortear);
    if (caso !== null) casos.push(caso);
  }
  // "Nenhuma exceção" é conferida aqui: se replanejar lançar, a suíte inteira falha.
  const saidas = casos.map((caso) => replanejar(caso));

  test('os casos exercitam o que interessa', () => {
    const conta = (condicao) => casos.filter(condicao).length;
    assert.ok(conta((c) => c.hoje > c.plano.fim) > 10, 'depois do fim');
    assert.ok(conta((c) => c.blocos.some((b) => b.fixado && b.data >= c.hoje)) > 30, 'fixados');
    assert.ok(conta((c) => c.blocos.some((b) => b.status !== 'PENDENTE' && b.data === c.hoje)) > 30, 'mantidos de hoje');
    assert.ok(saidas.filter((s) => s.cobertura === 'ATIVA').length > 5, 'reta final ativa');
    assert.ok(saidas.filter((s) => s.blocosFuturos.some((b) => b.tipo === 'REVISAO')).length > 30, 'revisões');
  });

  test('a mesma entrada dá a mesma saída, e a entrada não é alterada', () => {
    casos.forEach((caso, i) => {
      const copia = structuredClone(caso);
      assert.deepEqual(replanejar(caso), saidas[i], `caso ${i}`);
      assert.deepEqual(caso, copia, `caso ${i}`);
    });
  });

  test('nenhum bloco de blocosFuturos tem data antes de hoje', () => {
    casos.forEach((caso, i) => {
      assert.ok(saidas[i].blocosFuturos.every((b) => b.data >= caso.hoje), `caso ${i}`);
    });
  });

  test('nenhum slot (data, ordem) aparece duas vezes', () => {
    saidas.forEach((saida, i) => {
      const slots = saida.blocosFuturos.map((b) => `${b.data}#${b.ordem}`);
      assert.equal(new Set(slots).size, slots.length, `caso ${i}`);
    });
  });

  test('cada mantido sai idêntico, com o mesmo id e os mesmos campos', () => {
    casos.forEach((caso, i) => {
      if (caso.hoje > caso.plano.fim) return;
      const mantidos = caso.blocos.filter(
        (b) => b.data >= caso.hoje && (b.status !== 'PENDENTE' || b.fixado === true),
      );
      const comId = saidas[i].blocosFuturos.filter((b) => b.id !== undefined);
      assert.deepEqual(comId, mantidos, `caso ${i}`);
    });
  });

  test('no máximo uma REVISAO PENDENTE não extra por matéria', () => {
    saidas.forEach((saida, i) => {
      const revisoes = saida.blocosFuturos
        .filter((b) => b.tipo === 'REVISAO' && b.status === 'PENDENTE' && b.extra !== true)
        .map((b) => b.topicoId);
      assert.equal(new Set(revisoes).size, revisoes.length, `caso ${i}`);
    });
  });

  test('os blocos saem em ordem de data e ordem, e todo bloco novo tem motivo', () => {
    saidas.forEach((saida, i) => {
      const chaves = saida.blocosFuturos.map((b) => `${b.data}#${String(b.ordem).padStart(3, '0')}`);
      assert.deepEqual(chaves, [...chaves].sort(), `caso ${i}`);
      const novos = saida.blocosFuturos.filter((b) => b.id === undefined);
      assert.ok(novos.every((b) => typeof b.motivo === 'string' && b.motivo.length > 0), `caso ${i}`);
    });
  });
});
