// Etapa 2 do pipeline: a demanda cabe na capacidade? Se não, quais as saídas (docs/algoritmo.md §4).
import { calcularCapacidade } from './capacidade.js';
import { demanda, ordenarPorPrioridade } from './prioridade.js';
import { somarDias } from '../util/datas.js';

// Limites das buscas da escapatória 1. Com eles a busca sempre termina, mesmo num plano
// que nenhum aumento resolve (por exemplo, sem nenhum dia disponível).
const PASSO_MINUTOS = 5;
const MAXIMO_MINUTOS_A_MAIS = 480;
const MAXIMO_DIAS_A_MAIS = 365;

function somar(numeros) {
  return numeros.reduce((soma, n) => soma + n, 0);
}

// Simula em vez de dividir: o déficit de blocos não vira minutos por uma conta direta,
// porque cada dia arredonda para baixo (floor) e descarta o que fica abaixo de 15 min.
// Somar minutos só ajuda quando um dia passa de um múltiplo da duração do bloco, então
// a única resposta certa é recalcular a capacidade com a mesma função da etapa 1.
function buscarMinutosPorDia(plano, demandaTotal) {
  const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => (plano.disponibilidade[d] ?? 0) > 0);
  if (dias.length === 0) return null;

  for (let extra = PASSO_MINUTOS; extra <= MAXIMO_MINUTOS_A_MAIS; extra += PASSO_MINUTOS) {
    const disponibilidade = {};
    for (let d = 0; d <= 6; d++) disponibilidade[d] = plano.disponibilidade[d] ?? 0;
    for (const d of dias) disponibilidade[d] += extra;

    if (calcularCapacidade({ ...plano, disponibilidade }).capacidadeEstudo >= demandaTotal) {
      return extra;
    }
  }
  return null;
}

// Com dataAvaliacao, a janela de estudo termina na prova: dias depois do fim não entrariam
// nela, então estender o fim nunca ajuda e a opção nem existe.
function buscarDiasAMais(plano, demandaTotal) {
  if (plano.dataAvaliacao != null) return null;

  for (let k = 1; k <= MAXIMO_DIAS_A_MAIS; k++) {
    const fim = somarDias(plano.fim, k);
    if (calcularCapacidade({ ...plano, fim }).capacidadeEstudo >= demandaTotal) return k;
  }
  return null;
}

function maisTempo(plano, demandaTotal) {
  const diasAMais = buscarDiasAMais(plano, demandaTotal);
  return {
    minutosPorDia: buscarMinutosPorDia(plano, demandaTotal),
    diasAMais,
    novoFim: diasAMais === null ? null : somarDias(plano.fim, diasAMais),
  };
}

// R5: o corte começa pelo fim da ordem canônica. A prioridade não depende da demanda,
// então a ordem não muda durante o corte: basta esgotar o último tópico (até 1) antes de
// passar ao penúltimo, o que equivale a "tirar sempre do de menor prioridade".
function reduzirDemanda(topicos, demandas, capacidadeEstudo) {
  const depois = new Map(demandas);
  let deficit = somar([...demandas.values()]) - capacidadeEstudo;

  const doMenorParaOMaior = ordenarPorPrioridade(topicos).reverse();
  for (const topico of doMenorParaOMaior) {
    while (deficit > 0 && depois.get(topico) > 1) {
      depois.set(topico, depois.get(topico) - 1);
      deficit--;
    }
  }

  return {
    // Na ordem de cadastro, para a interface mostrar a lista como o aluno a montou.
    topicos: topicos.map((t) => ({ id: t.id, antes: demandas.get(t), depois: depois.get(t) })),
    suficiente: deficit <= 0,
  };
}

function removerTopicos(topicos, demandas, capacidadeEstudo) {
  let demandaRestante = somar([...demandas.values()]);
  const removidos = [];

  for (const topico of ordenarPorPrioridade(topicos).reverse()) {
    if (demandaRestante <= capacidadeEstudo) break;
    removidos.push(topico.id);
    demandaRestante -= demandas.get(topico);
  }
  return { removidos, demandaRestante };
}

export function avaliarViabilidade({ plano, topicos }) {
  const { capacidadeEstudo } = calcularCapacidade(plano);

  // Indexado pelo próprio objeto do tópico: ordenarPorPrioridade devolve os mesmos objetos,
  // então a demanda se mantém ligada ao tópico certo mesmo que dois ids se repitam.
  const demandas = new Map(topicos.map((t) => [t, demanda(t)]));
  const demandaTotal = somar([...demandas.values()]);
  const viavel = capacidadeEstudo >= demandaTotal;
  const deficit = Math.max(0, demandaTotal - capacidadeEstudo);

  // Sem demanda não há o que cobrir; tratamos como 100% para evitar a divisão por zero.
  const percentual = demandaTotal === 0
    ? 100
    : Math.floor((100 * Math.min(capacidadeEstudo, demandaTotal)) / demandaTotal);

  // R16: com menos blocos que tópicos, algum tópico ficaria sem nenhum bloco.
  const comDemanda = [...demandas.values()].filter((d) => d > 0).length;
  const bloqueante = capacidadeEstudo < comDemanda;

  const escapatorias = viavel
    ? null
    : {
        maisTempo: maisTempo(plano, demandaTotal),
        reduzirDemanda: reduzirDemanda(topicos, demandas, capacidadeEstudo),
        removerTopicos: removerTopicos(topicos, demandas, capacidadeEstudo),
      };

  return {
    viavel,
    bloqueante,
    capacidadeEstudo,
    demandaTotal,
    deficit,
    cobertura: { percentual },
    escapatorias,
  };
}
