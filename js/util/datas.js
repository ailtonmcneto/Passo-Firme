// Datas do Passo Firme são strings 'YYYY-MM-DD' do calendário local (docs/algoritmo.md §1).
//
// Por que strings: `new Date('2026-11-09')` é lido como meia-noite em UTC, que em
// São Paulo (UTC−3) ainda é 08/11 às 21h. Com strings, "dia 9" é sempre dia 9,
// qualquer que seja o fuso do computador, e a comparação fica igual à do Java.
//
// Por dentro, cada data vira um "dia absoluto": o número de dias desde 01/01/1970,
// calculado em UTC. Como UTC não tem horário de verão, todo dia tem exatamente
// 24 h e a aritmética de dias é uma conta de inteiros, sem surpresa.

const MS_POR_DIA = 86_400_000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

// Devolve o dia absoluto, ou null se a string não for uma data real.
function lerData(s) {
  if (typeof s !== 'string') return null;
  const partes = FORMATO.exec(s);
  if (partes === null) return null;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  // setUTCFullYear em vez de Date.UTC: o Date.UTC transforma os anos 0–99 em 1900–1999.
  const data = new Date(0);
  data.setUTCFullYear(ano, mes - 1, dia);

  // O Date "conserta" datas impossíveis (30/02 vira 02/03); se algo mudou, a data não existe.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return data.getTime() / MS_POR_DIA;
}

function exigirData(s) {
  const dia = lerData(s);
  if (dia === null) {
    throw new RangeError(`data inválida: ${JSON.stringify(s)} (esperado 'YYYY-MM-DD')`);
  }
  return dia;
}

function exigirInteiro(n, nome) {
  if (!Number.isInteger(n)) {
    throw new RangeError(`${nome} deve ser um número inteiro, recebido ${JSON.stringify(n)}`);
  }
}

function formatar(diaAbsoluto) {
  const data = new Date(diaAbsoluto * MS_POR_DIA);
  const ano = String(data.getUTCFullYear()).padStart(4, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function ehDataValida(s) {
  return lerData(s) !== null;
}

export function somarDias(s, n) {
  exigirInteiro(n, 'n');
  return formatar(exigirData(s) + n);
}

// Devolve b − a: positivo quando b vem depois de a.
export function diferencaEmDias(a, b) {
  return exigirData(b) - exigirData(a);
}

// 0 = domingo … 6 = sábado, a mesma convenção do getDay() do JS.
export function diaDaSemana(s) {
  return new Date(exigirData(s) * MS_POR_DIA).getUTCDay();
}

// Lista as datas de inicio até fim, inclusive. Se fim vier antes de inicio, o intervalo é
// vazio; quem precisar tratar isso como erro (como a capacidade) valida antes de chamar.
export function intervaloDeDatas(inicio, fim) {
  const primeiro = exigirData(inicio);
  const ultimo = exigirData(fim);
  const datas = [];
  for (let dia = primeiro; dia <= ultimo; dia++) {
    datas.push(formatar(dia));
  }
  return datas;
}

// Única função que usa os getters locais, porque "hoje" é o dia no relógio do aluno.
// Recebe o Date pronto para continuar pura: quem chama faz o `new Date()`, fora de js/core.
export function hojeLocal(agora) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) {
    throw new RangeError('hojeLocal espera um Date válido');
  }
  const ano = String(agora.getFullYear()).padStart(4, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
