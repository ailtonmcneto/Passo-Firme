// SM-2 (docs/algoritmo.md §7): decide quando cada matéria volta como revisão.
//
// O estado não é gravado em lugar nenhum. Ele é recalculado a partir dos blocos concluídos toda
// vez que alguém precisa dele, do mesmo jeito que o cronograma é regenerado. Se o estado fosse
// gravado no tópico, bastaria uma conclusão gravada sem o estado (aba fechada no meio, bug
// corrigido depois) para os dois discordarem para sempre. Recalculando, o histórico é a única
// fonte e o porte em Java só precisa reproduzir uma função pura.
import { ehDataValida, somarDias } from '../util/datas.js';

// Ease factor em centésimos: 250 = 2,50. Em ponto flutuante, 1,94 vira 1,9399999999999997 e
// 25 × 1,94 dá 48,49999…, que arredonda para 48 em vez de 49. Com inteiros, a conta dá o mesmo
// em JS, em Java e no papel.
export const ESTADO_INICIAL = Object.freeze({
  efCentesimos: 250,
  intervalo: 0,
  repeticoes: 0,
  ultimaRevisao: null,
  proximaRevisao: null,
});

// As três respostas da autoavaliação (R15). As qualidades 0, 2 e 4 existem na fórmula do SM-2,
// mas a tela não as oferece: três opções bastam e são mais fáceis de responder com honestidade.
export const QUALIDADE_POR_RESPOSTA = Object.freeze({
  EXPLIQUEI_SEM_CONSULTAR: 5,
  ENTENDI_MAS_TRAVARIA: 3,
  NAO_ENTROU: 1,
});

// O SM-2 original não deixa o ease factor cair abaixo de 1,30: abaixo disso as revisões ficariam
// tão próximas que a matéria nunca sairia do lugar.
const EF_MINIMO = 130;

function exigirQualidade(qualidade) {
  if (!Number.isInteger(qualidade) || qualidade < 0 || qualidade > 5) {
    throw new RangeError(`qualidade deve ser um inteiro de 0 a 5, recebido ${JSON.stringify(qualidade)}`);
  }
}

// A fórmula de uma repetição. Devolve só a parte numérica do estado; as datas ficam com quem
// sabe em que dia a repetição aconteceu (estadoDoTopico).
export function proximaRevisao(estado, qualidade) {
  exigirQualidade(qualidade);

  // Não lembrou: recomeça a sequência, mas o ease factor fica. Ele mede a dificuldade da matéria,
  // e uma resposta ruim isolada não deveria apagar o que se sabe sobre ela.
  if (qualidade < 3) {
    return { efCentesimos: estado.efCentesimos, intervalo: 1, repeticoes: 0 };
  }

  // A fórmula original é EF + 0,1 − (5−q)·(0,08 + (5−q)·0,02); multiplicada por 100, fica toda
  // em inteiros: +10 para q = 5, 0 para q = 4 e −14 para q = 3.
  const erro = 5 - qualidade;
  const efCentesimos = Math.max(EF_MINIMO, estado.efCentesimos + 10 - erro * (8 + erro * 2));

  let intervalo;
  if (estado.repeticoes === 0) {
    intervalo = 1;
  } else if (estado.repeticoes === 1) {
    intervalo = 3;
  } else {
    // intervalo × EF arredondado meio-para-cima: somar 50 antes de dividir por 100 é o mesmo que
    // somar 0,5 antes de truncar, só que sem sair dos inteiros. Usa o EF já atualizado, como o
    // SM-2 original.
    intervalo = Math.floor((estado.intervalo * efCentesimos + 50) / 100);
  }

  return { efCentesimos, intervalo, repeticoes: estado.repeticoes + 1 };
}

// Ordem das conclusões: dia, depois a sequência gerada pela fachada. Nunca o id, que diz quando o
// bloco foi criado (pelo planejamento), não quando o aluno o concluiu. Comparar as strings
// 'YYYY-MM-DD' direto funciona porque elas já foram validadas e têm largura fixa.
function compararConclusoes(a, b) {
  if (a.concluidoEm !== b.concluidoEm) return a.concluidoEm < b.concluidoEm ? -1 : 1;
  return a.sequenciaConclusao - b.sequenciaConclusao;
}

// Devolve os blocos CONCLUIDO, validados, na ordem das conclusões. É exportada para que o
// estimador (§12) use exatamente a mesma ordem, como as etapas usam o mesmo compararCanonico.
// PENDENTE, PULADO e PERDIDO são ignorados sem validação: os campos de conclusão não valem
// nada para eles.
export function conclusoesEmOrdem(blocos) {
  const concluidos = blocos.filter((b) => b.status === 'CONCLUIDO');
  const sequencias = new Set();
  for (const bloco of concluidos) {
    exigirQualidade(bloco.qualidade);
    if (!ehDataValida(bloco.concluidoEm)) {
      throw new RangeError(`concluidoEm inválido no bloco ${bloco.id}: ${JSON.stringify(bloco.concluidoEm)}`);
    }
    const sequencia = bloco.sequenciaConclusao;
    if (!Number.isInteger(sequencia) || sequencia < 0) {
      throw new RangeError(`sequenciaConclusao deve ser um inteiro ≥ 0 no bloco ${bloco.id}, recebido ${JSON.stringify(sequencia)}`);
    }
    // Duas conclusões com a mesma sequência deixariam a ordem dentro do dia indefinida, e a
    // última resposta do dia (a que vale) dependeria da ordem do array.
    if (sequencias.has(sequencia)) {
      throw new RangeError(`sequenciaConclusao ${sequencia} repetida`);
    }
    sequencias.add(sequencia);
  }
  // filter já devolveu um array novo, então o sort não mexe no do chamador.
  return concluidos.sort(compararConclusoes);
}

// Recebe as conclusões de uma matéria já validadas e em ordem.
function estadoDasConclusoes(conclusoes) {
  if (conclusoes.length === 0) return { ...ESTADO_INICIAL };

  let estado = ESTADO_INICIAL;
  for (let i = 0; i < conclusoes.length; i++) {
    const atual = conclusoes[i];
    const seguinte = conclusoes[i + 1];
    // Uma repetição por dia: rever a matéria duas vezes no mesmo dia não espaça nada, e contar as
    // duas inflaria o intervalo (dois "5" na segunda já pulariam direto para 3 dias). Vale a
    // última resposta do dia, que é o que o aluno sabe ao fim dele.
    if (seguinte !== undefined && seguinte.concluidoEm === atual.concluidoEm) continue;
    estado = proximaRevisao(estado, atual.qualidade);
  }

  const ultimaRevisao = conclusoes[conclusoes.length - 1].concluidoEm;
  return { ...estado, ultimaRevisao, proximaRevisao: somarDias(ultimaRevisao, estado.intervalo) };
}

export function estadoDoTopico(blocosDoTopico) {
  return estadoDasConclusoes(conclusoesEmOrdem(blocosDoTopico));
}

// Calcula o estado de todas as matérias de uma vez: valida e ordena todos os blocos uma vez só
// (O(n log n)) e depois só reparte por matéria, o que mantém a ordem. Quem precisa dos estados
// chama esta função uma vez e consulta o Map, em vez de recalcular a matéria a cada bloco.
// A sequência é única no plano, então a repetição é conferida entre todas as matérias.
// Bloco sem topicoId (uma RESERVA) não é matéria e fica de fora.
export function estadosPeloHistorico(blocos) {
  const porTopico = new Map();
  for (const bloco of conclusoesEmOrdem(blocos.filter((b) => b.topicoId != null))) {
    if (!porTopico.has(bloco.topicoId)) porTopico.set(bloco.topicoId, []);
    porTopico.get(bloco.topicoId).push(bloco);
  }

  const estados = new Map();
  for (const [topicoId, conclusoes] of porTopico) {
    estados.set(topicoId, estadoDasConclusoes(conclusoes));
  }
  return estados;
}
