// Sugestão de ajuste do domínio (docs/algoritmo.md §12).
//
// É a primeira implementação da interface EstimadorDificuldade: "dadas as respostas do aluno numa
// matéria, o domínio declarado parece errado?". JS não tem `interface`; o contrato são as
// assinaturas destas três funções. Uma versão futura (um modelo treinado, por exemplo) só precisa
// exportar as mesmas funções com o mesmo formato de retorno, e a fachada continua igual. No Java,
// isto vira `interface EstimadorDificuldade` com a classe da regra implementando-a.
//
// A autoavaliação nunca muda o domínio sozinha: sugerir só sugere, e o aluno aceita ou recusa.
import { conclusoesEmOrdem, QUALIDADE_POR_RESPOSTA } from './sm2.js';
import { ehManual } from './prioridade.js';

const { EXPLIQUEI_SEM_CONSULTAR, NAO_ENTROU } = QUALIDADE_POR_RESPOSTA;

// Quantas respostas iguais seguidas disparam a sugestão. Descer pede menos evidência que subir:
// duas vezes "não entrou" já indica que a matéria está sendo subestimada, e o custo de errar
// para baixo é só estudar um pouco a mais.
const SEGUIDAS_PARA_DESCER = 2;
const SEGUIDAS_PARA_SUBIR = 3;

function exigirDominio(valor, nome) {
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    throw new RangeError(`${nome} deve ser um inteiro de 1 a 5, recebido ${JSON.stringify(valor)}`);
  }
}

function terminaCom(qualidades, valor, quantas) {
  return qualidades.length >= quantas && qualidades.slice(-quantas).every((q) => q === valor);
}

function contarConcluidos(blocos) {
  return blocos.filter((b) => b.status === 'CONCLUIDO').length;
}

export function sugerirAjusteDominio(topico, blocosDoTopico) {
  exigirDominio(topico.dominio, 'dominio');

  // Mesma ordem do SM-2 (§7), mas aqui cada conclusão conta, mesmo duas no mesmo dia: o SM-2 se
  // importa com o espaçamento, o estimador só com o que o aluno respondeu.
  // Ignorar as `dominioRevisadoApos` primeiras é o que faz a sequência recomeçar depois de uma
  // sugestão aceita ou recusada, sem guardar data nem depender do relógio.
  const qualidades = conclusoesEmOrdem(blocosDoTopico)
    .slice(topico.dominioRevisadoApos ?? 0)
    .map((b) => b.qualidade);

  const { id, nome, dominio } = topico;
  if (dominio > 1 && terminaCom(qualidades, NAO_ENTROU, SEGUIDAS_PARA_DESCER)) {
    return {
      id,
      de: dominio,
      para: dominio - 1,
      motivo: `você marcou 'não entrou' nas ${SEGUIDAS_PARA_DESCER} últimas vezes em ${nome}; o domínio declarado é ${dominio}`,
    };
  }
  if (dominio < 5 && terminaCom(qualidades, EXPLIQUEI_SEM_CONSULTAR, SEGUIDAS_PARA_SUBIR)) {
    return {
      id,
      de: dominio,
      para: dominio + 1,
      motivo: `você marcou 'consegui explicar sem consultar' nas ${SEGUIDAS_PARA_SUBIR} últimas vezes em ${nome}; o domínio declarado é ${dominio}`,
    };
  }
  return null;
}

// Devolve um tópico novo (não muta o recebido). Quem chama grava e roda `replanejar`.
export function aplicarAjusteDominio(topico, novoDominio, blocosDoTopico) {
  exigirDominio(topico.dominio, 'dominio');
  exigirDominio(novoDominio, 'novoDominio');

  const ajustado = {
    ...topico,
    dominio: novoDominio,
    dominioRevisadoApos: contarConcluidos(blocosDoTopico),
  };

  // Tópico manual: o aluno pediu uma quantidade de blocos, e o domínio só muda a prioridade.
  if (ehManual(topico)) return ajustado;

  // Tópico automático: a demanda é 6 − domínio (§2), então os blocos mudam pela diferença.
  // Nunca abaixo dos ESTUDOs já concluídos (inclusive os antecipados, que contam no C2): o que
  // foi feito não se desfaz, e a demanda restante nunca fica negativa.
  if (!Number.isInteger(topico.blocosAlocados) || topico.blocosAlocados < 0) {
    throw new RangeError(`blocosAlocados deve ser um inteiro ≥ 0, recebido ${JSON.stringify(topico.blocosAlocados)}`);
  }
  const estudosConcluidos = blocosDoTopico.filter((b) => b.status === 'CONCLUIDO' && b.tipo === 'ESTUDO').length;
  const diferenca = (6 - novoDominio) - (6 - topico.dominio);
  ajustado.blocosAlocados = Math.max(estudosConcluidos, topico.blocosAlocados + diferenca);
  return ajustado;
}

// Recusar também zera a contagem: a mesma sugestão só volta depois de uma sequência nova de
// respostas, em vez de reaparecer a cada bloco concluído.
export function recusarAjusteDominio(topico, blocosDoTopico) {
  return { ...topico, dominioRevisadoApos: contarConcluidos(blocosDoTopico) };
}
