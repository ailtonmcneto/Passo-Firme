// Fluxo diário sobre o cronograma salvo (docs/front.md §5.1): concluir, pular, replanejar e
// mudar o cadastro de um plano em andamento.
//
// Tudo aqui é função pura: recebe o cronograma, devolve um cronograma novo e nunca altera o
// recebido. Não abre o IndexedDB, não mexe na tela e não lê o relógio: a data de hoje sempre
// chega como parâmetro. Quem grava o resultado é a fachada (js/api.js), o único arquivo que
// importa este.
//
// O cronograma (sessão versão 2) tem este formato:
//   { versao: 2, plano, topicos, celulas, blocos, proximoId, proximaSequencia, atualizadoEm,
//     viabilidade, retaFinal, cobertura, avisos, mudancas }
// `blocos` guarda TODOS os blocos do plano, passados e futuros. O passado é o histórico de onde
// o SM-2 tira as revisões, então nada é apagado.
import { replanejar } from './core/replanejador.js';
import { estadosPeloHistorico, QUALIDADE_POR_RESPOSTA } from './core/sm2.js';
import { aplicarAjusteDominio } from './core/estimador.js';
import { dataAlvo } from './core/cobertura.js';
import { diaDaSemana } from './util/datas.js';

// Lança o erro que a tela mostra ao aluno quando a condição não vale.
function exigir(condicao, mensagem) {
    if (!condicao) throw new RangeError(mensagem);
}

// Data crescente e, no mesmo dia, a posição do bloco. Strings 'YYYY-MM-DD' têm sempre o mesmo
// tamanho, então compará-las dá a mesma ordem que comparar as datas.
function compararSlots(a, b) {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    return a.ordem - b.ordem;
}

// Recebe as células do aluno e uma data; devolve a hora do bloco que ocupa a posição `ordem`
// naquele dia. Ex.: segunda com 19:00 e 19:30 pintadas, ordem 2 → '19:30'.
// O 1º bloco do dia fica na célula mais cedo, o 2º na seguinte, e assim por diante (§3.3).
function horaDoSlot(celulas, data, ordem) {
    const doDia = celulas
        .filter((celula) => celula.diaSemana === diaDaSemana(data))
        .map((celula) => celula.hora)
        .sort();
    return doDia[ordem - 1];
}

// Recebe o cronograma e um id; devolve a posição do bloco na lista. Lança RangeError se o id
// não existe. Ex.: posicaoDoBloco(cronograma, 3) → 2, se o bloco 3 é o terceiro da lista.
function posicaoDoBloco(cronograma, blocoId) {
    const posicao = cronograma.blocos.findIndex((bloco) => bloco.id === blocoId);
    exigir(posicao >= 0, 'Esse bloco não está no seu plano.');
    return posicao;
}

// Recebe o resultado não bloqueado de montarPrevia (js/api.js) e a data de hoje; devolve o
// cronograma versão 2, pronto para gravar.
// Ex.: uma prévia com 16 blocos vira um cronograma com ids 1 a 16 e proximoId 17.
export function iniciarCronograma(previa, hoje) {
    exigir(previa && previa.bloqueado === false, 'Esse plano ainda não pode ser montado.');

    // O id é só um número que cresce. Ele não diz nada sobre a data nem sobre a posição do
    // bloco, e por isso continua apontando para o mesmo bloco depois de um replanejamento.
    const blocos = previa.blocos.map((bloco, indice) => ({ ...bloco, id: indice + 1 }));

    return {
        versao: 2,
        plano: previa.plano,
        topicos: previa.topicos,
        celulas: previa.celulas,
        blocos,
        proximoId: blocos.length + 1,
        proximaSequencia: 1,
        atualizadoEm: hoje,
        viabilidade: previa.viabilidade,
        retaFinal: previa.retaFinal ?? null,
        cobertura: previa.cobertura,
        avisos: previa.avisos,
        mudancas: [],
    };
}

// Recebe o cronograma salvo e a data de hoje; devolve true se o plano precisa ser refeito
// antes de mostrar o dia, e false se pode ser mostrado como está.
// Precisa replanejar quando:
//   - o último replanejamento (`atualizadoEm`) foi em outro dia; ou
//   - existe bloco PENDENTE com data anterior a hoje que não seja RESERVA (um estudo ou uma
//     revisão que ficou para trás). RESERVA é horário livre, não tarefa: não conta.
// Ex.: atualizadoEm '2026-11-30' e hoje '2026-11-30', nada pendente no passado → false;
//      o mesmo cronograma com hoje '2026-12-01' → true.
export function precisaReplanejar(cronograma, hoje) {
    // Dia novo: as revisões e a distribuição dependem de hoje, então o plano é refeito.
    if (cronograma.atualizadoEm !== hoje) return true;

    // Mesmo dia, mas sobrou tarefa no passado: ela precisa virar PERDIDO e voltar como demanda.
    // `some` para no primeiro bloco que cumpre a condição e devolve true ou false.
    return cronograma.blocos.some((bloco) =>
        bloco.data < hoje && bloco.status === 'PENDENTE' && bloco.tipo !== 'RESERVA');
}

// Recebe o cronograma antigo, o resultado de `replanejar` e o novo conjunto de blocos; devolve
// as mudanças automáticas (sem as causas que quem chamou já trouxe).
// Ex.: um bloco pulado ontem → [{ antes: bloco, depois: null, causa: 'PULADO_VOLTOU' }].
function mudancasDoReplanejamento(cronograma, perdidos, futuros, hoje) {
    const mudancas = [];

    // Os blocos que "voltam como demanda": os pulados desde o último replanejamento e os que
    // ficaram para trás agora. O bloco vai como estava antes, para a tela dizer o que era.
    for (const bloco of cronograma.blocos) {
        const desdeUltimaVez = bloco.data >= cronograma.atualizadoEm && bloco.data < hoje;
        if (bloco.status === 'PULADO' && desdeUltimaVez) {
            mudancas.push({ antes: bloco, depois: null, causa: 'PULADO_VOLTOU' });
        } else if (perdidos.has(bloco.id)) {
            mudancas.push({ antes: bloco, depois: null, causa: 'PERDIDO_VOLTOU' });
        }
    }

    // Revisão nova: a matéria não tinha revisão comum pendente de hoje em diante e agora tem.
    // Só a comum, porque a extra é sugestão do dia e muda a cada replanejamento.
    const ehRevisaoComum = (bloco) => bloco.tipo === 'REVISAO' && bloco.extra !== true
        && bloco.status === 'PENDENTE' && bloco.data >= hoje;
    const tinhaRevisao = new Set(cronograma.blocos.filter(ehRevisaoComum).map((bloco) => bloco.topicoId));
    for (const bloco of futuros) {
        if (ehRevisaoComum(bloco) && !tinhaRevisao.has(bloco.topicoId)) {
            mudancas.push({ antes: null, depois: bloco, causa: 'REVISAO_AGENDADA' });
        }
    }
    return mudancas;
}

// Recebe o cronograma, a data de hoje e as causas que quem chamou quer registrar; devolve o
// cronograma refeito de hoje em diante, com a lista "O que mudou".
// Ex.: replanejarCronograma(cronograma, '2026-12-02') num plano em que o aluno pulou um bloco
// na segunda devolve mudancas = [{ antes: bloco pulado, depois: null, causa: 'PULADO_VOLTOU' }].
export function replanejarCronograma(cronograma, hoje, causas = []) {
    const { plano, topicos, celulas } = cronograma;
    const resultado = replanejar({ plano, topicos, blocos: cronograma.blocos, hoje });
    const perdidos = new Set(resultado.perdidos);

    // 1. O passado fica como está: é o histórico. Só o estudo ou a revisão que não foi feita
    //    vira PERDIDO, para não aparecer como pendente para sempre.
    const passado = cronograma.blocos
        .filter((bloco) => bloco.data < hoje)
        .map((bloco) => (perdidos.has(bloco.id) ? { ...bloco, status: 'PERDIDO' } : bloco));

    // 2. De hoje em diante: os blocos mantidos (concluídos, pulados e fixados) voltam iguais,
    //    com o id de sempre. Os novos ganham id, hora e o nome da matéria.
    const nomes = new Map(topicos.map((topico) => [topico.id, topico.nome]));
    let proximoId = cronograma.proximoId;
    const futuros = resultado.blocosFuturos.map((bloco) => {
        if (bloco.id !== undefined) return bloco;
        return {
            ...bloco,
            id: proximoId++,
            hora: horaDoSlot(celulas, bloco.data, bloco.ordem),
            topicoNome: nomes.get(bloco.topicoId) ?? 'Horário livre',
        };
    });

    // 3. Depois do fim do plano a viabilidade vem null. Fora isso, ela leva junto os números
    //    da reta final, no mesmo formato que a fachada usa na criação.
    const viabilidade = resultado.viabilidade && { ...resultado.viabilidade, retaFinal: resultado.retaFinal };

    return {
        ...cronograma,
        blocos: [...passado, ...futuros].sort(compararSlots),
        proximoId,
        atualizadoEm: hoje,
        viabilidade,
        retaFinal: resultado.retaFinal,
        cobertura: resultado.cobertura,
        avisos: resultado.avisos,
        mudancas: [...causas, ...mudancasDoReplanejamento(cronograma, perdidos, futuros, hoje)],
    };
}

// Recebe o cronograma, o id de um bloco de hoje, a resposta da autoavaliação e a data de hoje;
// devolve { cronograma, proximaRevisao }, com o bloco marcado como Passo dado.
// Ex.: concluir(cronograma, 1, 'EXPLIQUEI_SEM_CONSULTAR', '2026-11-30')
//      → bloco 1 CONCLUIDO com qualidade 5 e proximaRevisao '2026-12-01'.
// Não replaneja: o resto do dia fica como o aluno viu. O efeito aparece no próximo
// replanejamento (amanhã, ao abrir o app), que é quando a próxima revisão pode cair.
export function concluir(cronograma, blocoId, resposta, hoje) {
    const posicao = posicaoDoBloco(cronograma, blocoId);
    const bloco = cronograma.blocos[posicao];
    exigir(bloco.status === 'PENDENTE' && bloco.tipo !== 'RESERVA' && bloco.data === hoje,
        'Só dá para concluir um estudo pendente de hoje.');
    // Object.hasOwn evita aceitar nomes herdados de todo objeto, como 'toString'.
    exigir(typeof resposta === 'string' && Object.hasOwn(QUALIDADE_POR_RESPOSTA, resposta),
        'Escolha uma das três respostas de "Como foi?".');

    // sequenciaConclusao desempata duas conclusões no mesmo dia (§7: vale a última do dia).
    const concluido = {
        ...bloco,
        status: 'CONCLUIDO',
        qualidade: QUALIDADE_POR_RESPOSTA[resposta],
        concluidoEm: hoje,
        sequenciaConclusao: cronograma.proximaSequencia,
    };
    const blocos = cronograma.blocos.with(posicao, concluido);

    // O estado do SM-2 nunca é gravado: sai sempre do histórico, já com esta conclusão.
    const estado = estadosPeloHistorico(blocos).get(bloco.topicoId);
    return {
        cronograma: { ...cronograma, blocos, proximaSequencia: cronograma.proximaSequencia + 1 },
        proximaRevisao: estado.proximaRevisao,
    };
}

// Recebe o cronograma, o id de um bloco de hoje ou do futuro e a data de hoje; devolve o
// cronograma com o bloco PULADO. Ex.: pular(cronograma, 2, '2026-11-30') → bloco 2 PULADO.
// Também não replaneja: o bloco pulado volta como demanda no replanejamento seguinte.
export function pular(cronograma, blocoId, hoje) {
    const posicao = posicaoDoBloco(cronograma, blocoId);
    const bloco = cronograma.blocos[posicao];
    exigir(bloco.status === 'PENDENTE' && bloco.tipo !== 'RESERVA' && bloco.data >= hoje,
        'Só dá para pular um estudo pendente de hoje ou dos próximos dias.');
    return { ...cronograma, blocos: cronograma.blocos.with(posicao, { ...bloco, status: 'PULADO' }) };
}

// Recebe a matéria como estava no plano, a matéria nova do cadastro e os blocos dela; devolve
// a matéria que vai para o replanejamento.
// Ex.: História com domínio 4 e blocosAlocados 2 que passa a domínio 2 → blocosAlocados 4.
function atualizarTopico(antiga, nova, blocosDoTopico) {
    // Começa da antiga para manter blocosAlocados e dominioRevisadoApos, que o cadastro não tem.
    let topico = { ...antiga, nome: nova.nome, peso: nova.peso, ordem: nova.ordem };

    // Domínio diferente: o estimador ajusta os blocos da matéria automática pela diferença de
    // demanda (§12), sem descer abaixo do que já foi estudado.
    if (nova.dominio !== antiga.dominio) topico = aplicarAjusteDominio(topico, nova.dominio, blocosDoTopico);

    // Quantidade pedida diferente: o pedido do aluno vira a nova promessa. Se ele apagou o
    // pedido, a matéria volta a ser automática e o replanejador usa a demanda pelo domínio.
    if (nova.blocosDesejados !== antiga.blocosDesejados) {
        const { blocosDesejados, blocosAlocados, ...resto } = topico;
        topico = nova.blocosDesejados === undefined
            ? resto
            : { ...resto, blocosDesejados: nova.blocosDesejados, blocosAlocados: nova.blocosDesejados };
    }
    return topico;
}

// Recebe o cronograma, o cadastro novo já validado ({ plano, topicos, celulas }) e a data de
// hoje; devolve o cronograma replanejado com as matérias, o período e os horários novos.
// Ex.: pintar terça 19:00 e baixar o domínio de História → História ganha 2 blocos e
// mudancas começa com { antes: null, depois: null, causa: 'HORARIOS_ALTERADOS' }.
export function atualizarCadastro(cronograma, { plano, topicos, celulas }, hoje) {
    // O início não muda depois que o plano começou: os blocos do passado dependem dele. A
    // resposta da reta final também fica; se a prova mudou de data, ela deixa de valer sozinha.
    const planoNovo = {
        ...cronograma.plano,
        fim: plano.fim,
        dataAvaliacao: plano.dataAvaliacao ?? null,
        nomeAvaliacao: plano.nomeAvaliacao ?? '',
        disponibilidade: plano.disponibilidade,
    };

    // Cada matéria nova entra sem blocosAlocados, e o replanejador usa a demanda dela (C2). A
    // matéria removida some da lista; os blocos dela continuam no histórico.
    const antigas = new Map(cronograma.topicos.map((topico) => [topico.id, topico]));
    const topicosNovos = topicos.map((nova) => {
        const antiga = antigas.get(nova.id);
        if (!antiga) return nova;
        const blocosDoTopico = cronograma.blocos.filter((bloco) => bloco.topicoId === nova.id);
        return atualizarTopico(antiga, nova, blocosDoTopico);
    });

    const atualizado = { ...cronograma, plano: planoNovo, topicos: topicosNovos, celulas };
    return replanejarCronograma(atualizado, hoje, [{ antes: null, depois: null, causa: 'HORARIOS_ALTERADOS' }]);
}

// Recebe o cronograma, a resposta do aluno à reta final (true = ativar) e a data de hoje;
// devolve o cronograma replanejado com a resposta gravada.
// Ex.: responderCobertura(cronograma, true, '2026-12-11') → cobertura 'ATIVA' e mudancas
// [{ antes: null, depois: null, causa: 'RETA_FINAL' }].
export function responderCobertura(cronograma, aceitar, hoje) {
    exigir(typeof aceitar === 'boolean', 'Responda se quer ativar a reta final.');
    // Gravar uma recusa fora da reta final calaria a pergunta antes da hora: ela só é feita
    // uma vez por prova (§6.1).
    exigir(cronograma.cobertura !== 'NAO_SE_APLICA', 'A reta final não está disponível agora.');

    // A resposta vale para esta data-alvo. Se a prova mudar de data, a pergunta volta.
    const plano = {
        ...cronograma.plano,
        respostaCobertura: { resposta: aceitar ? 'ACEITO' : 'RECUSADO', dataAlvo: dataAlvo(cronograma.plano) },
    };
    const causas = aceitar ? [{ antes: null, depois: null, causa: 'RETA_FINAL' }] : [];
    return replanejarCronograma({ ...cronograma, plano }, hoje, causas);
}

// Recebe o cronograma e uma data; devolve os blocos daquela data, em ordem de horário.
// Ex.: blocosDoDia(cronograma, '2026-11-30') → os blocos 1 e 2 da segunda-feira.
export function blocosDoDia(cronograma, data) {
    return cronograma.blocos.filter((bloco) => bloco.data === data).sort(compararSlots);
}
