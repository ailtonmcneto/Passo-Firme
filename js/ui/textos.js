// Textos da tela "Seu passo de hoje" (docs/front.md §3.5 e §3.8).
// Ficam aqui, em funções puras (sem DOM), para dar para testar no Node. Podem usar
// js/util/datas.js, mas nunca js/core/: a tela não calcula, só escreve o que a fachada devolve.
import { diaDaSemana, ehDataValida } from '../util/datas.js';

// Abreviações na ordem do diaDaSemana: 0 = domingo … 6 = sábado.
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Quantos itens a faixa "O que mudou" lista por frase antes de resumir com "e mais K".
const MAXIMO_DE_ITENS = 3;

// Recebe um bloco ({ tipo, extra }); devolve o nome do tipo para mostrar na tela.
// Ex.: rotuloDoTipo({ tipo: 'REVISAO', extra: true }) → 'Revisão extra'.
export function rotuloDoTipo(bloco) {
    if (bloco.tipo === 'RESERVA') return 'Horário livre';
    if (bloco.tipo === 'REVISAO') return bloco.extra ? 'Revisão extra' : 'Revisão';
    return bloco.extra ? 'Estudo antecipado' : 'Estudo';
}

// Recebe uma data 'YYYY-MM-DD'; devolve o dia da semana abreviado e o dia/mês.
// Ex.: dataCurta('2026-12-02') → 'qua 02/12'.
// Não usa Intl de propósito: assim o texto sai igual em qualquer máquina e o teste não depende
// do idioma instalado. O dia e o mês saem direto da string, sem passar por Date.
export function dataCurta(data) {
    const dia = data.slice(8, 10);
    const mes = data.slice(5, 7);
    return `${DIAS_CURTOS[diaDaSemana(data)]} ${dia}/${mes}`;
}

// Recebe um bloco; devolve como ele aparece numa lista: matéria, data curta e hora.
// Ex.: itemDoBloco({ topicoNome: 'Português', data: '2026-11-30', hora: '19:30' })
//      → 'Português, seg 30/11 19:30'.
function itemDoBloco(bloco) {
    return `${bloco.topicoNome}, ${dataCurta(bloco.data)} ${bloco.hora}`;
}

// Recebe os blocos que voltaram para o plano; devolve a lista deles para o fim da frase,
// com no máximo 3 itens e "e mais K" quando houver mais.
// Ex.: 5 blocos → 'A, …; B, …; C, … e mais 2'.
function listaDeBlocos(blocos) {
    const itens = blocos.slice(0, MAXIMO_DE_ITENS).map(itemDoBloco).join('; ');
    const resto = blocos.length - MAXIMO_DE_ITENS;
    return resto > 0 ? `${itens} e mais ${resto}` : itens;
}

// Recebe os blocos que voltaram e as duas formas da frase (singular e plural); devolve a frase.
// Ex.: (1 bloco, 'que você pulou voltou', 'que você pulou voltaram')
//      → '1 estudo que você pulou voltou para o plano: Português, seg 30/11 19:30.'
function fraseDeVolta(blocos, singular, plural) {
    const quantos = blocos.length === 1 ? `1 estudo ${singular}` : `${blocos.length} estudos ${plural}`;
    return `${quantos} para o plano: ${listaDeBlocos(blocos)}.`;
}

// Recebe as mudanças do último replanejamento ([{ antes, depois, causa }], front.md §5.1);
// devolve as frases da faixa "O que mudou", uma por causa, na ordem em que cada causa aparece
// pela primeira vez. A exceção é REVISAO_AGENDADA, que tem uma frase por revisão.
// Ex.: [{ causa: 'RETA_FINAL', ... }] → ['Reta final ativada.'].
// Nunca fala em "atrasado", "falhou" nem conta dias perdidos (front.md §3.8).
export function textoMudancas(mudancas) {
    // Junta as mudanças por causa. O Map lembra a ordem em que cada chave entrou, e é ela que
    // decide a ordem das frases.
    const porCausa = new Map();
    for (const mudanca of mudancas) {
        if (!porCausa.has(mudanca.causa)) porCausa.set(mudanca.causa, []);
        porCausa.get(mudanca.causa).push(mudanca);
    }

    const frases = [];
    for (const [causa, lista] of porCausa) {
        if (causa === 'PULADO_VOLTOU') {
            // Nas duas causas de volta, o bloco como estava fica em `antes`.
            frases.push(fraseDeVolta(lista.map(m => m.antes), 'que você pulou voltou', 'que você pulou voltaram'));
        } else if (causa === 'PERDIDO_VOLTOU') {
            frases.push(fraseDeVolta(lista.map(m => m.antes), 'que ficou para trás voltou', 'que ficaram para trás voltaram'));
        } else if (causa === 'REVISAO_AGENDADA') {
            // Na revisão nova, o bloco fica em `depois`.
            for (const m of lista) frases.push(`Revisão de ${m.depois.topicoNome} marcada para ${dataCurta(m.depois.data)}.`);
        } else if (causa === 'HORARIOS_ALTERADOS') {
            frases.push('O plano foi refeito com suas matérias e horários novos.');
        } else if (causa === 'RETA_FINAL') {
            frases.push('Reta final ativada.');
        }
        // Outras causas (AJUSTE_DOMINIO, da sugestão de domínio) ainda não chegam da fachada
        // local; ficam sem frase até a tela da sugestão existir.
    }
    return frases;
}

// Recebe a matéria do bloco concluído e a próxima revisão (data ou null); devolve a confirmação.
// Ex.: textoPassoDado('Matemática', '2026-12-02') → 'Passo dado. Próxima revisão de Matemática a partir de qua 02/12.'
export function textoPassoDado(topicoNome, proximaRevisao) {
    if (!proximaRevisao) return 'Passo dado.';
    return `Passo dado. Próxima revisão de ${topicoNome} a partir de ${dataCurta(proximaRevisao)}.`;
}

// Recebe o próximo bloco de estudo depois de hoje; devolve a frase para o dia sem estudo.
// Ex.: textoProximoEstudo({ data: '2026-12-02', hora: '19:00' }) → 'Seu próximo estudo é qua 02/12 às 19:00.'
export function textoProximoEstudo(bloco) {
    return `Seu próximo estudo é ${dataCurta(bloco.data)} às ${bloco.hora}.`;
}

// ----- Modo de demonstração -----
// Para apresentar o produto sem esperar os dias passarem, a página aceita ?hoje=YYYY-MM-DD na
// URL. Só avançar a data é um caso tratado: voltar no tempo com o mesmo plano não é.

// Recebe a parte "?..." da URL (location.search) e a data real de hoje; devolve a data que a
// plataforma deve usar como hoje e se ela é simulada.
// Ex.: lerHojeDaUrl('?hoje=2026-12-04', '2026-11-25') → { hoje: '2026-12-04', simulado: true }
//      lerHojeDaUrl('', '2026-11-25') → { hoje: '2026-11-25', simulado: false }
// Uma data inválida (2026-02-30, texto solto) é ignorada, e vale a data real.
export function lerHojeDaUrl(search, hojeReal) {
    // URLSearchParams entende "?a=1&b=2" e já tira o "?" do começo.
    const valor = new URLSearchParams(search).get('hoje');
    if (valor !== null && ehDataValida(valor)) return { hoje: valor, simulado: true };
    return { hoje: hojeReal, simulado: false };
}

// Recebe o href de um link (como está escrito no HTML) e a data simulada; devolve o href com
// ?hoje=data, para o modo de demonstração continuar ligado na página seguinte.
// Ex.: comHoje('../index.html', '2026-12-04') → '../index.html?hoje=2026-12-04'
//      comHoje('#sobre', '2026-12-04') → '#sobre' (âncora na mesma página: não recarrega)
// Links para fora do site (http, mailto) e âncoras ficam como estão.
export function comHoje(href, hoje) {
    if (href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return href;
    // Separa a âncora (#...) e a busca (?...) do caminho, para pôr o hoje no lugar certo.
    const [semAncora, ...resto] = href.split('#');
    const ancora = resto.length ? '#' + resto.join('#') : '';
    const [caminho, busca = ''] = semAncora.split('?');
    const parametros = new URLSearchParams(busca);
    parametros.set('hoje', hoje);
    return `${caminho}?${parametros}${ancora}`;
}
