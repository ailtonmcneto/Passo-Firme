// Revisões na reserva (docs/algoritmo.md §9). As revisões não são guardadas: a cada
// replanejamento elas saem de novo do estado do SM-2 e ocupam os blocos RESERVA que o
// sequenciador espalhou pelo período.
import { compararCanonico } from './prioridade.js';
import { compararPorRetencao, diasDesdeUltima } from './retencao.js';
import { diferencaEmDias, somarDias } from '../util/datas.js';

// Data crescente e, no mesmo dia, a posição do bloco. As datas 'YYYY-MM-DD' têm sempre o
// mesmo tamanho, então comparar as strings dá a mesma ordem que comparar os dias.
function compararSlots(a, b) {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  return a.ordem - b.ordem;
}

// Uma RESERVA que o aluno fixou é um mantido (§10.1): ele quis aquele horário livre, então
// nem revisão nem bloco extra entram ali.
function ehSlotLivre(bloco) {
  return bloco.tipo === 'RESERVA' && bloco.status === 'PENDENTE' && bloco.fixado !== true;
}

// Pular é escolha do aluno: a matéria pulada hoje não volta hoje, nem como revisão nem
// como bloco extra. Insistir no mesmo dia seria tratar o plano como ordem, não como sugestão.
function materiasPuladasHoje(blocos, hoje) {
  return new Set(
    blocos.filter((b) => b.status === 'PULADO' && b.data === hoje).map((b) => b.topicoId),
  );
}

// Junta à matéria o que o desempate por retenção precisa (§8). A retenção é sempre medida
// em `hoje`, e não na data de cada slot, para a ordem ser uma só durante todo o encaixe.
function comRetencao(topico, estado, hoje) {
  return {
    ...topico,
    estado,
    diasDesdeUltima: diasDesdeUltima(estado, hoje),
    intervalo: estado.intervalo,
  };
}

export function encaixarRevisoes({
  blocos,
  topicos,
  estados,
  hoje,
  fim,
  modoCobertura = false,
  dataAlvo = null,
}) {
  // Copia só a lista: os blocos que não mudam são devolvidos como vieram, e o slot que vira
  // revisão é trocado por um objeto novo. Assim a entrada nunca é alterada.
  const resultado = [...blocos];
  const emOrdem = resultado.map((_, i) => i).sort((i, j) => compararSlots(resultado[i], resultado[j]));
  const avisos = [];

  const puladasHoje = materiasPuladasHoje(blocos, hoje);
  const amanha = somarDias(hoje, 1);
  const pendentes = blocos.filter((b) => b.status === 'PENDENTE');
  // Uma revisão fixada pelo aluno (§10.1) já é a revisão pendente da matéria.
  const jaTemRevisao = new Set(pendentes.filter((b) => b.tipo === 'REVISAO').map((b) => b.topicoId));
  const estudosPendentes = pendentes.filter((b) => b.tipo === 'ESTUDO' && diferencaEmDias(hoje, b.data) >= 0);

  const candidatas = topicos
    .map((t, indice) => ({ ...t, ordem: t.ordem ?? indice }))
    .filter((t) => estados.has(t.id) && !jaTemRevisao.has(t.id))
    .map((t) => comRetencao(t, estados.get(t.id), hoje))
    .filter((t) => diferencaEmDias(t.estado.proximaRevisao, fim) >= 0)
    .map((t) => ({
      ...t,
      // R10: revisão atrasada conta como devida hoje, em vez de se acumular no passado.
      devida: diferencaEmDias(t.estado.proximaRevisao, hoje) > 0 ? hoje : t.estado.proximaRevisao,
    }))
    .sort((a, b) => diferencaEmDias(b.devida, a.devida) || compararPorRetencao(a, b) || compararCanonico(a, b));

  for (const materia of candidatas) {
    let minima = materia.devida;
    if (puladasHoje.has(materia.id) && diferencaEmDias(minima, amanha) > 0) minima = amanha;

    const indice = emOrdem.find((i) => {
      const slot = resultado[i];
      if (!ehSlotLivre(slot) || diferencaEmDias(minima, slot.data) < 0) return false;
      // Na reta final as revisões só voltam depois da prova.
      return !modoCobertura || diferencaEmDias(dataAlvo, slot.data) > 0;
    });
    const slot = indice === undefined ? null : resultado[indice];

    // C5: se um estudo da matéria chega antes do slot (ou no mesmo dia), ele já faz o papel
    // da revisão, e gastar a reserva com ela seria repetir. Sem slot nenhum, qualquer estudo
    // futuro serve. Olha a data do slot, e não a data devida: com a reserva cheia, o slot
    // pode ficar bem depois da devida, e um estudo no meio do caminho resolve.
    const estudoChegaAntes = estudosPendentes.some(
      (b) => b.topicoId === materia.id && (slot === null || diferencaEmDias(b.data, slot.data) >= 0),
    );
    if (estudoChegaAntes) continue;

    if (slot !== null) {
      resultado[indice] = { ...slot, tipo: 'REVISAO', topicoId: materia.id, extra: false };
    } else if (!modoCobertura) {
      // Na reta final a falta de espaço é proposital, então não vira aviso.
      avisos.push({ id: materia.id, tipo: 'REVISAO_SEM_ESPACO', devida: materia.devida });
    }
  }

  return { blocos: resultado, avisos };
}

// Reserva que sobrou hoje vira sugestão: primeiro uma revisão extra da matéria mais
// esquecida, depois um estudo antecipado. Só hoje, porque os dias futuros são regenerados a
// cada replanejamento e preencher agora seria trabalho jogado fora.
export function preencherReservaDeHoje({ blocos, topicos, estados, hoje }) {
  const resultado = [...blocos];
  const livresDeHoje = resultado
    .map((_, i) => i)
    .filter((i) => resultado[i].data === hoje && ehSlotLivre(resultado[i]))
    .sort((i, j) => compararSlots(resultado[i], resultado[j]));
  if (livresDeHoje.length === 0) return resultado;

  const puladasHoje = materiasPuladasHoje(blocos, hoje);
  // Quem já tem estudo ou revisão para fazer hoje não precisa de revisão extra.
  const comPendenteHoje = new Set(
    blocos
      .filter((b) => b.data === hoje && b.status === 'PENDENTE' && (b.tipo === 'ESTUDO' || b.tipo === 'REVISAO'))
      .map((b) => b.topicoId),
  );

  const materias = topicos
    .map((t, indice) => ({ ...t, ordem: t.ordem ?? indice }))
    .filter((t) => !puladasHoje.has(t.id));
  const paraRevisar = materias
    .filter((t) => estados.has(t.id) && !comPendenteHoje.has(t.id))
    .map((t) => comRetencao(t, estados.get(t.id), hoje))
    .sort((a, b) => compararPorRetencao(a, b) || compararCanonico(a, b));
  const paraEstudar = materias.filter((t) => t.demanda > 0).sort(compararCanonico);

  // Uma lista só para os dois passos: cada matéria ganha no máximo um bloco extra por dia.
  const usadas = new Set();
  const proxima = (fila) => fila.find((t) => !usadas.has(t.id));

  for (const indice of livresDeHoje) {
    const revisao = proxima(paraRevisar);
    const escolhida = revisao ?? proxima(paraEstudar);
    // Sem ninguém para sugerir, o slot continua RESERVA e a tela mostra como folga.
    if (escolhida === undefined) break;

    usadas.add(escolhida.id);
    resultado[indice] = {
      ...resultado[indice],
      tipo: revisao ? 'REVISAO' : 'ESTUDO',
      topicoId: escolhida.id,
      extra: true,
    };
  }
  return resultado;
}
