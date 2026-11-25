import { calcularCapacidade } from './core/capacidade.js';
import { avaliarViabilidade } from './core/viabilidade.js';
import { gerarCronograma } from './core/pipeline.js';
import { avaliarRetaFinal, condicaoDeCobertura, estadoCobertura, dataAlvo } from './core/cobertura.js';
import { validarPlano } from './util/validacao.js';
import { diaDaSemana, diferencaEmDias, ehDataValida } from './util/datas.js';
import { lerSessao, gravarSessao } from './db.js';
// Com `* as fluxo`, as funções puras do fluxo diário ficam com o prefixo `fluxo.`. Assim não
// se confundem com as da fachada que têm o mesmo nome (atualizarCadastro, responderCobertura).
import * as fluxo from './fluxo.js';

function exigir(condicao, mensagem) {
    if (!condicao) throw new RangeError(mensagem);
}

function prepararPeriodo(plano, celulas) {
    exigir(plano && ehDataValida(plano.inicio) && ehDataValida(plano.fim), 'Preencha datas de início e fim válidas.');
    const dias = diferencaEmDias(plano.inicio, plano.fim);
    exigir(dias >= 0 && dias < 366, 'Escolha um período de 1 a 366 dias, com o fim a partir do início.');
    exigir(Array.isArray(celulas), 'Escolha seus horários disponíveis.');
    const chaves = new Set();
    const disponibilidade = Array(7).fill(0);
    const ordenadas = celulas.map(celula => {
        exigir(celula && Number.isInteger(celula.diaSemana) && celula.diaSemana >= 0 && celula.diaSemana <= 6,
            'O dia do horário deve estar entre domingo e sábado.');
        exigir(typeof celula.hora === 'string' && /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(celula.hora),
            'Escolha horários de 30 minutos entre 00:00 e 23:30.');
        const chave = `${celula.diaSemana}/${celula.hora}`;
        exigir(!chaves.has(chave), 'Um mesmo horário não pode ser escolhido duas vezes.');
        chaves.add(chave);
        disponibilidade[celula.diaSemana] += 30;
        return { diaSemana: celula.diaSemana, hora: celula.hora };
    }).sort((a, b) => a.diaSemana - b.diaSemana || a.hora.localeCompare(b.hora));
    const preparado = {
        inicio: plano.inicio, fim: plano.fim, dataAvaliacao: plano.dataAvaliacao || null,
        nomeAvaliacao: String(plano.nomeAvaliacao ?? '').trim(), disponibilidade,
        diasFolga: [], duracaoBlocoMin: 30, respostaCobertura: null
    };
    validarPlano(preparado);
    return { plano: preparado, celulas: ordenadas };
}

// Recebe o cadastro, hoje e, para um plano em andamento, o início dele; devolve o cadastro
// validado { plano, celulas, topicos, capacidade }, ou lança RangeError com a mensagem da tela.
// Ex.: prepararRascunho(rascunho, '2026-11-30') com início '2026-11-29' → erro de início.
function prepararRascunho(rascunho, hoje, inicioDoPlano = null) {
    exigir(ehDataValida(hoje), 'A data de hoje é inválida.');
    const preparado = prepararPeriodo(rascunho?.plano, rascunho?.celulas);
    if (inicioDoPlano === null) {
        exigir(preparado.plano.inicio >= hoje, 'Escolha uma data de início a partir de hoje.');
    } else {
        // Plano em andamento: o início não muda (os blocos do passado dependem dele), e o fim
        // não pode ficar no passado, senão não sobra nada para replanejar.
        exigir(preparado.plano.inicio === inicioDoPlano, 'A data de início não muda depois que o plano começou.');
        exigir(preparado.plano.fim >= hoje, 'Escolha uma data de fim a partir de hoje.');
    }
    exigir(Array.isArray(rascunho.topicos) && rascunho.topicos.length > 0, 'Adicione pelo menos uma matéria.');
    const nomes = new Set();
    const ids = new Set(['RESERVA', '__proto__', 'constructor', 'prototype']);
    const topicos = rascunho.topicos.map((topico, ordem) => {
        exigir(topico && typeof topico.id === 'string' && topico.id.trim() && !ids.has(topico.id), 'Cada matéria precisa ter um identificador único.');
        ids.add(topico.id);
        const nome = String(topico.nome ?? '').trim();
        const chave = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
        exigir(nome.length > 0 && !nomes.has(chave), 'Preencha nomes de matérias diferentes.');
        nomes.add(chave);
        for (const campo of ['dominio', 'peso']) {
            exigir(Number.isInteger(topico[campo]) && topico[campo] >= 1 && topico[campo] <= 5,
                `Responda às perguntas de domínio e peso de ${nome}.`);
        }
        const resultado = { id: topico.id, nome, dominio: topico.dominio, peso: topico.peso, ordem };
        if (topico.blocosDesejados != null && topico.blocosDesejados !== '') {
            exigir(Number.isSafeInteger(topico.blocosDesejados) && topico.blocosDesejados >= 1,
                `A quantidade de blocos de ${nome} deve ser um inteiro positivo.`);
            resultado.blocosDesejados = topico.blocosDesejados;
        }
        return resultado;
    });
    exigir(preparado.celulas.length > 0, 'Selecione pelo menos um horário disponível.');
    const capacidade = calcularCapacidade(preparado.plano);
    exigir(capacidade.dias.some(dia => dia.blocos.length > 0), 'Os horários escolhidos não ocorrem nesse período. Escolha outros dias ou amplie o período.');
    return { ...preparado, topicos, capacidade };
}

function resumir(plano, celulas, capacidade = calcularCapacidade(plano)) {
    return {
        blocosPorSemana: celulas.length, minutosPorSemana: celulas.length * 30,
        blocosNoPeriodo: capacidade.dias.reduce((soma, dia) => soma + dia.blocos.length, 0)
    };
}

export async function resumirDisponibilidade(plano, celulas) {
    const preparado = prepararPeriodo(plano, celulas);
    return resumir(preparado.plano, preparado.celulas);
}

function avaliar(preparado, hoje) {
    const { plano, topicos, celulas, capacidade } = preparado;
    const viabilidade = avaliarViabilidade({ plano, topicos });
    return {
        ...viabilidade, capacidadeTotal: capacidade.capacidadeTotal,
        capacidadeReserva: capacidade.capacidadeReserva,
        retaFinal: condicaoDeCobertura({ plano, viabilidade, hoje }) ? avaliarRetaFinal({ plano, topicos }) : null,
        ...resumir(plano, celulas, capacidade)
    };
}

export async function avaliarRascunho(rascunho, hoje) {
    return avaliar(prepararRascunho(rascunho, hoje), hoje);
}

export async function montarPrevia(rascunho, hoje, escolha = null) {
    const preparado = prepararRascunho(rascunho, hoje);
    const { plano, topicos, celulas } = preparado;
    const viabilidade = avaliar(preparado, hoje);
    const tipo = escolha?.tipo ?? null;
    exigir([null, 'PARCIAL', 'REDUZIR_DEMANDA', 'COBERTURA'].includes(tipo), 'Escolha uma das opções apresentadas para o plano.');
    if (tipo === 'REDUZIR_DEMANDA') exigir(viabilidade.escapatorias?.reduzirDemanda.suficiente, 'Não é possível resolver este plano reduzindo passagens.');
    if (tipo === 'COBERTURA') {
        exigir(viabilidade.retaFinal && !viabilidade.retaFinal.bloqueante, 'A reta final não está disponível para este plano.');
        plano.respostaCobertura = { resposta: 'ACEITO', dataAlvo: dataAlvo(plano) };
    }
    const bloqueado = (!viabilidade.viavel && tipo === null) || (viabilidade.bloqueante && tipo !== 'COBERTURA');
    if (bloqueado) return { bloqueado: true, plano, topicos, celulas, blocos: [], viabilidade, cobertura: estadoCobertura({ plano, viabilidade, hoje }), avisos: [] };
    const gerado = gerarCronograma({ plano, topicos, hoje, reduzirDemanda: tipo === 'REDUZIR_DEMANDA' });
    const porId = new Map(topicos.map(topico => [topico.id, topico]));
    const blocos = gerado.blocos.map(bloco => ({
        ...bloco, id: `${bloco.data}/${bloco.ordem}`,
        hora: celulas.filter(celula => celula.diaSemana === diaDaSemana(bloco.data))[bloco.ordem - 1].hora,
        topicoNome: porId.get(bloco.topicoId)?.nome ?? 'Horário livre'
    }));
    // A viabilidade do plano gerado usa só os números da geração (depois de reduzir passagens,
    // se essa foi a escolha) e a reta final calculada por ela. Da avaliação inicial ficam só os
    // números da grade, que não mudam com a escolha.
    const { capacidadeTotal, capacidadeReserva, blocosPorSemana, minutosPorSemana, blocosNoPeriodo } = viabilidade;
    return {
        ...gerado, plano, celulas, blocos,
        viabilidade: {
            ...gerado.viabilidade, capacidadeTotal, capacidadeReserva, retaFinal: gerado.retaFinal,
            blocosPorSemana, minutosPorSemana, blocosNoPeriodo
        }
    };
}

// A sessão guardada no navegador (docs/front.md §5.1): { versao: 2, revisao, rascunho, cronograma }.
// `revisao` conta as gravações e protege contra outra aba (js/db.js).
let sessaoAtual;
let fila = Promise.resolve();

// Não recebe nada; devolve a sessão em memória, lendo do IndexedDB na primeira vez.
// Ex.: na primeira visita → { versao: 2, revisao: 0, rascunho: null, cronograma: null }.
async function carregar() {
    if (!sessaoAtual) {
        const salva = await lerSessao();
        // Uma sessão sem versão 2 (o formato antigo, com `marcacoes`) é descartada. O contador
        // `revisao` continua o mesmo: a próxima gravação compara com ele e, se voltasse a 0,
        // toda gravação daria "seus dados mudaram em outra aba".
        sessaoAtual = salva?.versao === 2
            ? salva
            : { versao: 2, revisao: salva?.revisao ?? 0, rascunho: null, cronograma: null };
    }
    return sessaoAtual;
}

// Recebe uma função que transforma a sessão; grava o resultado e devolve uma cópia dele.
// Se a função devolver null, nada é gravado (e volta a sessão como estava).
// Ex.: atualizarSessao(sessao => ({ ...sessao, rascunho })) → a sessão nova, já gravada.
// As operações entram numa fila: uma só começa quando a anterior terminou, então duas ações
// rápidas seguidas nunca leem a mesma sessão e uma apaga o que a outra gravou.
function atualizarSessao(transformar) {
    const operacao = fila.then(async () => {
        const anterior = await carregar();
        const transformada = transformar(structuredClone(anterior));
        if (transformada === null) return structuredClone(anterior);
        const proxima = { ...transformada, versao: 2, revisao: anterior.revisao + 1 };
        await gravarSessao(proxima, anterior.revisao);
        sessaoAtual = proxima;
        return structuredClone(proxima);
    });
    // Um erro rejeita esta operação para quem chamou, mas não trava as próximas da fila.
    fila = operacao.catch(() => {});
    return operacao;
}

// Lança o erro da tela quando não há plano gerado; devolve o cronograma da sessão.
function exigirCronograma(sessao) {
    exigir(sessao.cronograma, 'Você ainda não tem um plano. Termine o cadastro para montar o seu.');
    return sessao.cronograma;
}

// Recebe o cronograma e hoje; devolve o cronograma refeito, se precisava (§4), ou o mesmo.
function emDia(cronograma, hoje) {
    return fluxo.precisaReplanejar(cronograma, hoje) ? fluxo.replanejarCronograma(cronograma, hoje) : cronograma;
}

export async function obterSessao() {
    await fila;
    return structuredClone(await carregar());
}

export async function salvarRascunho(rascunho) {
    const copia = structuredClone(rascunho);
    return atualizarSessao(sessao => ({ ...sessao, rascunho: copia }));
}

// Recebe o cadastro, hoje e a escolha da viabilidade; devolve a prévia (como montarPrevia) e,
// se ela não foi bloqueada, grava o cronograma novo.
// Ex.: gerarPlanoLocal(rascunho, '2026-11-30') → { bloqueado: false, blocos: [...], ... }.
// Só vale antes de o plano começar: depois disso o histórico já conta, e mudar o cadastro é
// com atualizarCadastro, que mantém o que foi feito.
export async function gerarPlanoLocal(rascunho, hoje, escolha = null) {
    const resultado = await montarPrevia(rascunho, hoje, escolha);
    if (!resultado.bloqueado) {
        const copia = structuredClone(rascunho);
        await atualizarSessao(sessao => {
            exigir(!sessao.cronograma || hoje < sessao.cronograma.plano.inicio,
                'Seu plano já começou. Use "Rever matérias e horários" para mudar o cadastro.');
            // `cadastro` guarda o rascunho que gerou o plano, para a tela avisar quando há
            // alterações por aplicar.
            return { ...sessao, rascunho: copia, cronograma: { ...fluxo.iniciarCronograma(resultado, hoje), cadastro: copia } };
        });
    }
    return resultado;
}

// Recebe hoje; devolve o dia para a tela: { data, blocos, mudancas, cobertura, retaFinal,
// viabilidade }, ou null se ainda não há plano.
// Ex.: obterHoje('2026-11-30') → { data: '2026-11-30', blocos: [bloco 1, bloco 2], mudancas: [], ... }.
// Se o plano é de outro dia (ou ficou estudo para trás), replaneja e grava antes. Abrir o app
// de novo no mesmo dia não grava nada.
export async function obterHoje(hoje) {
    exigir(ehDataValida(hoje), 'A data de hoje é inválida.');
    let cronograma = null;
    await atualizarSessao(sessao => {
        if (!sessao.cronograma) return null;
        cronograma = emDia(sessao.cronograma, hoje);
        return cronograma === sessao.cronograma ? null : { ...sessao, cronograma };
    });
    if (!cronograma) return null;
    const { mudancas, cobertura, retaFinal, viabilidade } = structuredClone(cronograma);
    return { data: hoje, blocos: fluxo.blocosDoDia(cronograma, hoje), mudancas, cobertura, retaFinal, viabilidade };
}

// Recebe o id de um bloco de hoje, a resposta de "Como foi?" e hoje; devolve { proximaRevisao }.
// Ex.: concluirBloco(1, 'EXPLIQUEI_SEM_CONSULTAR', '2026-11-30') → { proximaRevisao: '2026-12-01' }.
// Não replaneja (§4): o resto do dia fica como o aluno viu.
export async function concluirBloco(blocoId, resposta, hoje) {
    exigir(ehDataValida(hoje), 'A data de hoje é inválida.');
    let proximaRevisao;
    await atualizarSessao(sessao => {
        const resultado = fluxo.concluir(exigirCronograma(sessao), blocoId, resposta, hoje);
        proximaRevisao = resultado.proximaRevisao;
        return { ...sessao, cronograma: resultado.cronograma };
    });
    return { proximaRevisao };
}

// Recebe o id de um bloco de hoje ou do futuro e hoje; devolve { ok: true }.
// Ex.: pularBloco(2, '2026-11-30') → { ok: true }, e o bloco 2 fica PULADO.
// Também não replaneja: o bloco volta como demanda no replanejamento do dia seguinte.
export async function pularBloco(blocoId, hoje) {
    exigir(ehDataValida(hoje), 'A data de hoje é inválida.');
    await atualizarSessao(sessao => ({ ...sessao, cronograma: fluxo.pular(exigirCronograma(sessao), blocoId, hoje) }));
    return { ok: true };
}

// Recebe o cadastro revisto ({ plano, topicos, celulas }) de um plano em andamento e hoje;
// devolve { viabilidade, mudancas } do plano refeito.
// Ex.: atualizarCadastro(rascunho com terça 19:00 a mais, '2026-12-02')
//      → { viabilidade: {...}, mudancas: [{ causa: 'HORARIOS_ALTERADOS', ... }, ...] }.
// A validação é a do cadastro, mas o início tem que ser o do plano e o fim, a partir de hoje.
export async function atualizarCadastro(rascunho, hoje) {
    const copia = structuredClone(rascunho);
    let cronograma;
    await atualizarSessao(sessao => {
        const atual = exigirCronograma(sessao);
        const { plano, topicos, celulas } = prepararRascunho(copia, hoje, atual.plano.inicio);
        cronograma = { ...fluxo.atualizarCadastro(atual, { plano, topicos, celulas }, hoje), cadastro: copia };
        return { ...sessao, rascunho: copia, cronograma };
    });
    return structuredClone({ viabilidade: cronograma.viabilidade, mudancas: cronograma.mudancas });
}

// Recebe a resposta à reta final (true = ativar) e hoje; devolve { viabilidade, mudancas }.
// Ex.: responderCobertura(true, '2026-12-11') → mudancas começa com { causa: 'RETA_FINAL', ... }.
export async function responderCobertura(aceitar, hoje) {
    exigir(ehDataValida(hoje), 'A data de hoje é inválida.');
    let cronograma;
    await atualizarSessao(sessao => {
        // Replaneja antes, se preciso, para a resposta valer para a reta final de hoje.
        const atual = emDia(exigirCronograma(sessao), hoje);
        cronograma = fluxo.responderCobertura(atual, aceitar, hoje);
        return { ...sessao, cronograma };
    });
    return structuredClone({ viabilidade: cronograma.viabilidade, mudancas: cronograma.mudancas });
}
