import { calcularCapacidade } from './core/capacidade.js';
import { avaliarViabilidade } from './core/viabilidade.js';
import { gerarCronograma } from './core/pipeline.js';
import { avaliarRetaFinal, condicaoDeCobertura, estadoCobertura, dataAlvo } from './core/cobertura.js';
import { validarPlano } from './util/validacao.js';
import { diaDaSemana, diferencaEmDias, ehDataValida } from './util/datas.js';
import { lerSessao, gravarSessao } from './db.js';

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

function prepararRascunho(rascunho, hoje) {
    exigir(ehDataValida(hoje), 'A data de hoje é inválida.');
    const preparado = prepararPeriodo(rascunho?.plano, rascunho?.celulas);
    exigir(preparado.plano.inicio >= hoje, 'Escolha uma data de início a partir de hoje.');
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

let sessaoAtual;
let fila = Promise.resolve();

async function carregar() {
    if (!sessaoAtual) sessaoAtual = await lerSessao() ?? { rascunho: null, cronograma: null, marcacoes: [], revisao: 0 };
    return sessaoAtual;
}

function atualizarSessao(transformar) {
    const operacao = fila.then(async () => {
        const anterior = await carregar();
        const proxima = { ...transformar(structuredClone(anterior)), revisao: anterior.revisao + 1 };
        await gravarSessao(proxima, anterior.revisao);
        sessaoAtual = proxima;
        return structuredClone(proxima);
    });
    fila = operacao.catch(() => {});
    return operacao;
}

export async function obterSessao() {
    await fila;
    return structuredClone(await carregar());
}

export async function salvarRascunho(rascunho) {
    const copia = structuredClone(rascunho);
    return atualizarSessao(sessao => ({ ...sessao, rascunho: copia }));
}

export async function gerarPlanoLocal(rascunho, hoje, escolha = null) {
    const resultado = await montarPrevia(rascunho, hoje, escolha);
    if (!resultado.bloqueado) {
        const copia = structuredClone(rascunho);
        await atualizarSessao(sessao => ({ ...sessao, rascunho: copia, cronograma: { ...resultado, cadastro: copia }, marcacoes: [] }));
    }
    return resultado;
}

export async function marcarEstudo(id, concluido) {
    exigir(typeof concluido === 'boolean', 'Informe se o estudo foi concluído.');
    return atualizarSessao(sessao => {
        exigir(sessao.cronograma?.blocos.some(bloco => bloco.id === id && bloco.tipo !== 'RESERVA'), 'Esse estudo não está no seu cronograma.');
        const marcacoes = new Set(sessao.marcacoes);
        if (concluido) marcacoes.add(id); else marcacoes.delete(id);
        return { ...sessao, marcacoes: [...marcacoes] };
    });
}
