const demonstracao = document.querySelector("#demonstracao");

if (demonstracao) iniciarDemonstracao(demonstracao);

function iniciarDemonstracao(painel) {
    const buscar = seletor => painel.querySelector(seletor);
    const abas = [...painel.querySelectorAll('[role="tab"]')];
    const listaAbas = buscar(".demonstracao-abas");
    const telaPequena = window.matchMedia("(max-width: 760px)");
    const secoes = [...painel.querySelectorAll('[role="tabpanel"]')];
    const etapas = ["acoes", "foco", "avaliacao", "resultado"];
    const abasPorAcao = {
        "ver-percurso": "percurso",
        "ver-assessoria": "assessoria",
        "ver-hoje": "hoje"
    };
    const bloco = buscar("#demonstracao-bloco");
    const blocoSemana = buscar("#demonstracao-semana-atual");
    const proximoBloco = buscar("#demonstracao-semana-proximo");
    const confirmacao = buscar("#demonstracao-confirmacao");
    const anuncio = buscar("#demonstracao-status");

    // Os textos representam cenas prontas, sem reproduzir o cálculo do plano.
    const orientacoes = {
        hoje: {
            titulo: "Você escolhe quando. O plano organiza o quê.",
            texto: "O peso e o domínio de cada matéria orientam a distribuição. Cada bloco explica por que está ali."
        },
        percurso: {
            titulo: "Uma rotina que cabe nos seus horários.",
            texto: "Cada horário escolhido recebe um bloco de 30 minutos. A reserva pode receber revisões ou estudo extra; quando não há conteúdo elegível, fica como folga."
        },
        assessoria: {
            titulo: "Orientação em cada etapa do estudo.",
            texto: "A assessoria é automatizada: organiza as matérias, verifica o tempo disponível e ajusta o plano com as suas respostas e a sua rotina."
        }
    };
    const respostas = {
        EXPLIQUEI_SEM_CONSULTAR: {
            titulo: "Sua resposta orienta as próximas revisões.",
            texto: "Explicar sem consultar ajuda o plano a acompanhar o seu domínio. Neste primeiro estudo do exemplo, a revisão fica na terça-feira. As respostas também orientam os intervalos das revisões seguintes."
        },
        ENTENDI_MAS_TRAVARIA: {
            titulo: "Entender também é parte do processo.",
            texto: "Sua resposta indica que ainda vale praticar. Neste primeiro estudo do exemplo, a revisão fica na terça-feira. Nas revisões seguintes, as respostas ajudam a ajustar os intervalos."
        },
        NAO_ENTROU: {
            titulo: "Há espaço para retomar a matéria.",
            texto: "A resposta ajuda o plano a acompanhar a dificuldade. Neste primeiro estudo do exemplo, a revisão fica na terça-feira. O histórico pode levar a uma sugestão de ajuste do domínio, que você decide aceitar ou manter."
        }
    };
    const retornoAoPlano = {
        titulo: "Sua rotina mudou. O plano acompanha.",
        texto: "O bloco volta para o plano, sem penalidade. Nesta cena ele reaparece na terça-feira; no plano, o encaixe depende dos horários disponíveis e das demais matérias."
    };
    let abaAtual = "hoje";
    let estadoBloco = "pendente";
    let etapaAtual = "acoes";
    let respostaSelecionada = null;

    function atualizarOrientacao() {
        let orientacao = orientacoes[abaAtual];
        if (abaAtual !== "assessoria" && estadoBloco === "pulado") {
            orientacao = retornoAoPlano;
        } else if (abaAtual === "hoje" && respostaSelecionada) {
            orientacao = respostas[respostaSelecionada];
        } else if (abaAtual === "percurso" && estadoBloco === "concluido") {
            orientacao = {
                titulo: "O estudo de hoje abre espaço para revisar.",
                texto: "Veja a marca de Passo dado na segunda e a revisão de JavaScript na terça. Este é um cenário preparado para mostrar como o percurso acompanha o estudo."
            };
        }
        buscar("#demonstracao-orientacao-titulo").textContent = orientacao.titulo;
        buscar("#demonstracao-orientacao-texto").textContent = orientacao.texto;
    }

    function selecionarAba(nome, moverFoco = false) {
        const selecionada = abas.find(aba => aba.dataset.aba === nome);
        if (!selecionada) return;
        abaAtual = nome;
        abas.forEach(aba => {
            const ativa = aba === selecionada;
            aba.setAttribute("aria-selected", String(ativa));
            aba.tabIndex = ativa ? 0 : -1;
        });
        secoes.forEach(secao => {
            secao.hidden = secao.id !== selecionada.getAttribute("aria-controls");
        });
        atualizarOrientacao();
        if (moverFoco) selecionada.focus();
    }

    function mostrarEtapa(nome) {
        etapaAtual = nome;
        etapas.forEach(etapa => {
            buscar(`#demonstracao-${etapa}`).hidden = etapa !== nome;
        });
    }

    function mostrarResultado(estado, resposta = null) {
        estadoBloco = estado;
        respostaSelecionada = resposta;
        const concluido = estado === "concluido";
        const etiqueta = concluido ? "✓ Passo dado" : "↷ Pulado";
        bloco.dataset.estado = estado;
        blocoSemana.dataset.estado = estado;
        proximoBloco.dataset.estado = "alterado";
        proximoBloco.querySelector("strong").textContent = "JavaScript";
        buscar("#demonstracao-etiqueta").textContent = etiqueta;
        buscar("#demonstracao-semana-status").textContent = etiqueta;
        buscar("#demonstracao-proximo-tipo").textContent = concluido
            ? "Revisão"
            : "Estudo · replanejado";
        confirmacao.textContent = concluido
            ? "Passo dado. Neste exemplo, a revisão de JavaScript fica na terça-feira."
            : "O bloco voltou para o plano. Neste exemplo, ele reaparece na terça-feira.";
        mostrarEtapa("resultado");
        atualizarOrientacao();
        confirmacao.focus();
        anuncio.textContent = "O exemplo em Seu percurso também foi atualizado.";
    }

    function reiniciar() {
        estadoBloco = "pendente";
        respostaSelecionada = null;
        bloco.dataset.estado = "pendente";
        blocoSemana.dataset.estado = "pendente";
        proximoBloco.dataset.estado = "reserva";
        proximoBloco.querySelector("strong").textContent = "Reserva";
        buscar("#demonstracao-etiqueta").textContent = "Próximo bloco";
        buscar("#demonstracao-semana-status").textContent = "Estudo";
        buscar("#demonstracao-proximo-tipo").textContent = "Para revisões";
        confirmacao.textContent = "";
        mostrarEtapa("acoes");
        selecionarAba("hoje");
        anuncio.textContent = "Exemplo reiniciado. Seu passo de hoje está aberto.";
        buscar("#demonstracao-reiniciar").focus();
    }

    painel.addEventListener("click", evento => {
        const botao = evento.target.closest("button");
        if (!botao || !painel.contains(botao) || botao.disabled) return;
        if (botao.dataset.aba) {
            selecionarAba(botao.dataset.aba);
            return;
        }
        if (botao.id === "demonstracao-reiniciar") {
            reiniciar();
            return;
        }
        if (Object.hasOwn(abasPorAcao, botao.dataset.acao)) {
            selecionarAba(abasPorAcao[botao.dataset.acao], true);
            return;
        }
        if (estadoBloco !== "pendente") return;
        if (botao.dataset.resposta && etapaAtual === "avaliacao") {
            if (Object.hasOwn(respostas, botao.dataset.resposta)) {
                mostrarResultado("concluido", botao.dataset.resposta);
            }
            return;
        }
        const acao = botao.dataset.acao;
        if (acao === "fazer" && etapaAtual === "acoes") {
            anuncio.textContent = "";
            mostrarEtapa("foco");
            buscar("#demonstracao-foco-titulo").focus();
        } else if (acao === "encerrar" && etapaAtual === "foco") {
            mostrarEtapa("avaliacao");
            buscar("#demonstracao-avaliacao-titulo").focus();
        } else if (acao === "voltar" && etapaAtual === "foco") {
            mostrarEtapa("acoes");
            buscar('[data-acao="fazer"]').focus();
        } else if (acao === "pular" && etapaAtual === "acoes") {
            mostrarResultado("pulado");
        }
    });

    listaAbas.addEventListener("keydown", evento => {
        const indice = abas.indexOf(evento.target);
        if (indice === -1) return;
        const destinos = {
            ArrowRight: (indice + 1) % abas.length,
            ArrowDown: (indice + 1) % abas.length,
            ArrowLeft: (indice - 1 + abas.length) % abas.length,
            ArrowUp: (indice - 1 + abas.length) % abas.length,
            Home: 0,
            End: abas.length - 1
        };
        if (!Object.hasOwn(destinos, evento.key)) return;
        evento.preventDefault();
        selecionarAba(abas[destinos[evento.key]].dataset.aba, true);
    });

    function atualizarOrientacaoAbas() {
        listaAbas.setAttribute("aria-orientation", telaPequena.matches ? "horizontal" : "vertical");
    }

    telaPequena.addEventListener("change", atualizarOrientacaoAbas);
    atualizarOrientacaoAbas();

    painel.querySelectorAll("button[disabled]").forEach(botao => {
        botao.disabled = false;
    });
    buscar("#demonstracao-instrucao").textContent =
        "Escolha uma aba ou experimente o primeiro bloco.";
    selecionarAba("hoje");
}
