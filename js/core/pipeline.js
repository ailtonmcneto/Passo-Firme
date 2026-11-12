// O pipeline inteiro (docs/algoritmo.md §10): capacidade → viabilidade → alocação →
// sequenciamento → revisões. O cronograma é sempre derivado do que ainda falta, nunca
// acumulado: criar e replanejar chamam o mesmo miolo, `montarFuturo`.
import { calcularCapacidade } from './capacidade.js';
import { avaliarViabilidade } from './viabilidade.js';
import { alocar, montarEntradaAlocacao } from './alocador.js';
import { sequenciar } from './sequenciador.js';
import { avaliarRetaFinal, condicaoDeCobertura, dataAlvo, estadoCobertura } from './cobertura.js';
import { estadosPeloHistorico } from './sm2.js';
import { encaixarRevisoes, preencherReservaDeHoje } from './revisoes.js';
import { motivoDoBloco } from './retencao.js';
import { validarPlano } from '../util/validacao.js';
import { diferencaEmDias } from '../util/datas.js';

function chaveDoSlot(bloco) {
  return `${bloco.data}#${bloco.ordem}`;
}

function compararSlots(a, b) {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  return a.ordem - b.ordem;
}

// Monta os blocos de hoje em diante. `mantidos` são os blocos que não podem mudar
// (concluídos e pulados de hoje, e os fixados pelo aluno); `historico` são todos os blocos do
// plano, de onde sai o estado do SM-2. Na criação os dois vêm vazios.
export function montarFuturo({ plano, topicos, mantidos = [], historico = [], hoje }) {
  // 1. O plano "de hoje em diante", sem os slots dos mantidos. É este mesmo objeto que vai
  //    para a capacidade, a viabilidade e a reta final: se cada uma contasse os slots do seu
  //    jeito, a viabilidade poderia prometer um bloco que o sequenciador não tem onde pôr.
  const planoEfetivo = {
    ...plano,
    inicio: diferencaEmDias(plano.inicio, hoje) > 0 ? hoje : plano.inicio,
    ocupados: mantidos.map((b) => ({ data: b.data, ordem: b.ordem })),
  };

  // 2. Quanto cabe e se cabe.
  const capacidade = calcularCapacidade(planoEfetivo);
  const viabilidade = avaliarViabilidade({ plano: planoEfetivo, topicos });

  // 3. Reta final: a pergunta usa o plano original (a data-alvo e a resposta do aluno são
  //    dele), mas os números usam o efetivo.
  const cobertura = estadoCobertura({ plano, viabilidade, hoje });
  const retaFinal = condicaoDeCobertura({ plano, viabilidade, hoje })
    ? avaliarRetaFinal({ plano: planoEfetivo, topicos })
    : null;
  const retaFinalAtiva = cobertura === 'ATIVA';

  // 4. Quantos blocos para cada matéria. Na reta final, a reserva da janela vira estudo.
  const entrada = montarEntradaAlocacao(topicos);
  const alocacao = alocar({
    topicos: entrada,
    capacidade: retaFinalAtiva ? capacidade.capacidadeTotal : capacidade.capacidadeEstudo,
  });

  // 5. Em que ordem.
  const novos = sequenciar({ capacidade, alocacao, topicos: entrada, modoCobertura: retaFinalAtiva })
    .map((b) => ({ ...b, status: 'PENDENTE', extra: false, fixado: false }));

  // 6. O estado do SM-2 de cada matéria, calculado uma vez só para todas as etapas seguintes.
  const estados = estadosPeloHistorico(historico);

  // 7. As revisões entram nos blocos de reserva. Os mantidos vão junto porque um estudo
  //    fixado ou um bloco pulado hoje muda onde a revisão pode cair.
  const comRevisoes = encaixarRevisoes({
    blocos: [...mantidos, ...novos],
    topicos: entrada,
    estados,
    hoje,
    fim: plano.fim,
    modoCobertura: retaFinalAtiva,
    dataAlvo: dataAlvo(plano),
  });

  // 8. Na reta final não há sugestão extra: todo slot já foi para o que falta estudar.
  const preenchidos = retaFinalAtiva
    ? comRevisoes.blocos
    : preencherReservaDeHoje({ blocos: comRevisoes.blocos, topicos: entrada, estados, hoje });

  // 9. O motivo só é escrito nos blocos novos. Um mantido é reconhecido pelo slot que ocupa,
  //    que nenhum bloco novo pode ter (a capacidade já tirou esses slots).
  const slotsMantidos = new Set(mantidos.map(chaveDoSlot));
  const porId = new Map(topicos.map((t) => [t.id, t]));
  const blocos = preenchidos
    .map((b) => {
      if (slotsMantidos.has(chaveDoSlot(b))) return b;
      return { ...b, motivo: motivoDoBloco(b, porId.get(b.topicoId), estados.get(b.topicoId) ?? null) };
    })
    .sort(compararSlots);

  return {
    blocos,
    alocacao,
    viabilidade,
    retaFinal,
    cobertura,
    avisos: [...alocacao.avisos, ...comRevisoes.avisos],
  };
}

// Tira o campo sem alterar o tópico de quem chamou.
function semDemandaRestante(topico) {
  const { demandaRestante, ...resto } = topico;
  return resto;
}

// Criação do plano. É o único lugar que valida o plano e o único que pode bloquear (R16).
export function gerarCronograma({ plano, topicos, hoje, reduzirDemanda = false }) {
  validarPlano(plano);
  if (diferencaEmDias(hoje, plano.fim) < 0) {
    throw new RangeError(`fim (${plano.fim}) vem antes de hoje (${hoje})`);
  }

  // Escapatória 2 ("reduzir passagens"): as demandas `depois` entram como demandaRestante,
  // e daí em diante o pipeline as trata como qualquer outra demanda. A viabilidade usada
  // aqui é a de hoje em diante, a mesma conta que o montarFuturo faz.
  let topicosDaGeracao = topicos;
  if (reduzirDemanda) {
    const inicio = diferencaEmDias(plano.inicio, hoje) > 0 ? hoje : plano.inicio;
    const { escapatorias } = avaliarViabilidade({ plano: { ...plano, inicio }, topicos });
    // Plano viável não tem escapatória: não há o que reduzir.
    if (escapatorias !== null) {
      topicosDaGeracao = topicos.map((t, i) => ({
        ...t,
        demandaRestante: escapatorias.reduzirDemanda.topicos[i].depois,
      }));
    }
  }

  const futuro = montarFuturo({ plano, topicos: topicosDaGeracao, hoje });
  const { viabilidade, retaFinal, cobertura } = futuro;

  // R16: com menos blocos que matérias, alguma ficaria de fora sem o aluno ter escolhido
  // qual. Por isso a criação para e mostra as saídas. A reta final aceita é uma dessas
  // saídas: se com ela todas as matérias ganham bloco, o plano é gerado.
  const retaFinalResolve = cobertura === 'ATIVA' && !retaFinal.bloqueante;
  if (viabilidade.bloqueante && !retaFinalResolve) {
    return { bloqueado: true, blocos: [], topicos, viabilidade, retaFinal, cobertura, avisos: [] };
  }

  return {
    bloqueado: false,
    blocos: futuro.blocos,
    // C2: o resultado da alocação fica gravado na matéria. É dele que o replanejamento
    // desconta o que já foi estudado. A demandaRestante era só desta geração e não é gravada.
    topicos: topicosDaGeracao.map((t) => ({
      ...semDemandaRestante(t),
      blocosAlocados: futuro.alocacao.blocos[t.id],
    })),
    viabilidade,
    retaFinal,
    cobertura,
    avisos: futuro.avisos,
  };
}
