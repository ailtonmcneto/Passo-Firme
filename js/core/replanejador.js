// Replanejamento (docs/algoritmo.md §10.4). Não é um algoritmo à parte: separa o que não
// pode mudar, calcula quanto ainda falta de cada matéria e entrega tudo ao mesmo
// `montarFuturo` da criação. Regenerar o futuro é a operação normal do sistema.
import { montarFuturo } from './pipeline.js';
import { demanda } from './prioridade.js';
import { diferencaEmDias } from '../util/datas.js';

function ehFuturo(bloco, hoje) {
  return diferencaEmDias(hoje, bloco.data) >= 0;
}

// §10.1: do dia de hoje em diante, ficam os blocos que o aluno já resolveu (concluiu ou
// pulou) e os que ele mesmo pôs no lugar (fixados). Todo o resto é regenerado.
function ehMantido(bloco, hoje) {
  if (!ehFuturo(bloco, hoje)) return false;
  if (bloco.status === 'CONCLUIDO' || bloco.status === 'PULADO') return true;
  return bloco.status === 'PENDENTE' && bloco.fixado === true;
}

// C2: quanto ainda falta de cada matéria. Parte do que a alocação prometeu (blocosAlocados)
// e desconta o que já foi estudado e o que já tem lugar marcado (fixados). Bloco perdido ou
// pulado não desconta nada: é assim que ele "volta como demanda", sem ser empurrado para o
// dia seguinte. Devolve os tópicos com `demandaRestante`, sem alterar os originais.
export function calcularDemandaRestante({ topicos, blocos, hoje }) {
  const descontos = new Map();
  for (const b of blocos) {
    if (b.tipo !== 'ESTUDO') continue;
    // Estudo concluído conta em qualquer data, e os extras (estudo antecipado) também.
    const conta = b.status === 'CONCLUIDO' || (ehMantido(b, hoje) && b.status === 'PENDENTE');
    if (conta) descontos.set(b.topicoId, (descontos.get(b.topicoId) ?? 0) + 1);
  }

  return topicos.map((t) => {
    // Matéria adicionada depois da criação ainda não passou por uma alocação; vale a demanda
    // do cadastro. Uma demandaRestante que viesse de fora é descartada: quem a calcula é esta função.
    const { demandaRestante, ...cadastro } = t;
    const prometido = cadastro.blocosAlocados ?? demanda(cadastro);
    return { ...cadastro, demandaRestante: Math.max(0, prometido - (descontos.get(t.id) ?? 0)) };
  });
}

export function replanejar({ plano, topicos, blocos, hoje }) {
  // Quem não foi feito no dia não é empurrado para frente: vira PERDIDO. A função só devolve
  // os ids, porque gravar é com a fachada. A RESERVA do passado não era tarefa, então fica.
  const perdidos = blocos
    .filter((b) => !ehFuturo(b, hoje) && b.status === 'PENDENTE' && (b.tipo === 'ESTUDO' || b.tipo === 'REVISAO'))
    .map((b) => b.id);

  // Depois do fim não há futuro para montar.
  if (diferencaEmDias(hoje, plano.fim) < 0) {
    return {
      perdidos,
      blocosFuturos: [],
      viabilidade: null,
      retaFinal: null,
      cobertura: 'NAO_SE_APLICA',
      avisos: [],
    };
  }

  const futuro = montarFuturo({
    plano,
    topicos: calcularDemandaRestante({ topicos, blocos, hoje }),
    mantidos: blocos.filter((b) => ehMantido(b, hoje)),
    historico: blocos,
    hoje,
  });

  // Nunca bloqueia (R16 vale só na criação): se não cabe, sai o que cabe, com os avisos e as
  // escapatórias, para o aluno não ficar sem plano no meio do caminho.
  return {
    perdidos,
    blocosFuturos: futuro.blocos,
    viabilidade: futuro.viabilidade,
    retaFinal: futuro.retaFinal,
    cobertura: futuro.cobertura,
    avisos: futuro.avisos,
  };
}
