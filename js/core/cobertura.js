// Reta final, ou modo cobertura (docs/algoritmo.md §6.1, R9): prova em poucos dias e o plano
// não cabe. Este módulo só detecta e informa; quem ativa é o aluno, e quem aplica o modo é o
// pipeline (alocação com a capacidade total e sequência em revezamento).
import { calcularCapacidade } from './capacidade.js';
import { montarEntradaAlocacao } from './alocador.js';
import { diferencaEmDias } from '../util/datas.js';

// Até quantos dias antes da data-alvo a reta final pode ser oferecida.
export const DIAS_RETA_FINAL = 3;

export function dataAlvo(plano) {
  return plano.dataAvaliacao ?? plano.fim;
}

// `viabilidade` é a normal (§4), com os 20% de reserva: a pergunta é "o plano de sempre
// cabe?". Se cabe, não há o que oferecer.
export function condicaoDeCobertura({ plano, viabilidade, hoje }) {
  if (viabilidade.viavel) return false;
  const faltam = diferencaEmDias(hoje, dataAlvo(plano));
  return faltam >= 0 && faltam <= DIAS_RETA_FINAL;
}

// A resposta vale para uma prova específica. Se a data-alvo mudou, é outra prova e a pergunta
// volta a ser feita. Qualquer valor fora de ACEITO e RECUSADO conta como "sem resposta".
function respostaValida(plano) {
  const resposta = plano.respostaCobertura ?? null;
  if (resposta === null || resposta.dataAlvo !== dataAlvo(plano)) return null;
  if (resposta.resposta !== 'ACEITO' && resposta.resposta !== 'RECUSADO') return null;
  return resposta.resposta;
}

export function estadoCobertura({ plano, viabilidade, hoje }) {
  if (!condicaoDeCobertura({ plano, viabilidade, hoje })) return 'NAO_SE_APLICA';
  const resposta = respostaValida(plano);
  if (resposta === 'ACEITO') return 'ATIVA';
  if (resposta === 'RECUSADO') return 'RECUSADA';
  return 'PERGUNTAR';
}

// Os números da quinta saída. A demanda vem de montarEntradaAlocacao, que é a mesma regra da
// viabilidade (demanda(t)) e ainda respeita `demandaRestante` no replanejamento. Não chama
// avaliarViabilidade porque ela não devolve quantas matérias têm demanda, que o bloqueio
// precisa, e calcularia as escapatórias à toa.
export function avaliarRetaFinal({ plano, topicos }) {
  const { capacidadeTotal } = calcularCapacidade(plano);
  const demandas = montarEntradaAlocacao(topicos).map((t) => t.demanda);
  const demandaTotal = demandas.reduce((soma, d) => soma + d, 0);

  // Mesma convenção da viabilidade: sem demanda, 100%, para não dividir por zero.
  const percentual = demandaTotal === 0
    ? 100
    : Math.floor((100 * Math.min(capacidadeTotal, demandaTotal)) / demandaTotal);
  const comDemanda = demandas.filter((d) => d > 0).length;

  return {
    capacidadeEstudo: capacidadeTotal,
    demandaTotal,
    cobertura: { percentual },
    bloqueante: capacidadeTotal < comDemanda,
  };
}
