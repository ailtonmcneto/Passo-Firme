const demonstracao = document.querySelector("#demonstracao");

if (demonstracao) iniciarDemonstracao(demonstracao);

function iniciarDemonstracao(painel) {
    const buscar = seletor => painel.querySelector(seletor);
    const escrever = (nome, texto) => {
        buscar(`#demonstracao-${nome}`).textContent = texto;
    };
    const abas = [...painel.querySelectorAll('[role="tab"]')];
    const secoes = [...painel.querySelectorAll('[role="tabpanel"]')];
    const linhas = [...painel.querySelectorAll("[data-materia]")];
    const anuncio = buscar("#demonstracao-status");

    // Os valores são cenários conferidos, sem repetir o algoritmo na tela.
    const cenas = {
        normal: {
            dias: "Segunda a sexta", horario: "18:00–19:00", tempo: "1 hora por dia",
            total: 10, estudo: 8, demanda: 6,
            blocos: { javascript: 5, banco: 3, reserva: 2 },
            aviso: "Mais espaço para o que pesa mais e você domina menos.",
            situacao: "Cabe no seu tempo.",
            explicacao: "Experimente estudar em três dias da semana."
        },
        reduzido: {
            dias: "Segunda, quarta e sexta", horario: "18:00–19:00", tempo: "1 hora por dia",
            total: 6, estudo: 4, demanda: 6,
            blocos: { javascript: 2, banco: 2, reserva: 2 },
            aviso: "Prévia parcial: faltam 2 blocos. Veja uma opção em Ajustes.",
            situacao: "Faltam 2 blocos de estudo.",
            explicacao: "Uma opção: mais 30 minutos em cada dia disponível.",
            anuncio: "Exemplo com três dias. Rotina e distribuição atualizadas."
        },
        ajustado: {
            dias: "Segunda, quarta e sexta", horario: "18:00–19:30", tempo: "1h30 por dia",
            total: 9, estudo: 7, demanda: 6,
            blocos: { javascript: 5, banco: 2, reserva: 2 },
            aviso: "O tempo extra acomoda as matérias e mantém a reserva.",
            situacao: "Agora cabe no seu tempo.",
            explicacao: "Segunda, quarta e sexta, com 1h30 por dia.",
            anuncio: "Exemplo com mais 30 minutos por dia. Rotina e distribuição atualizadas."
        }
    };
    let cenaAtual = "normal";

    function selecionarAba(nome, moverFoco = false) {
        const selecionada = abas.find(aba => aba.dataset.aba === nome);
        if (!selecionada) return;
        abas.forEach(aba => {
            const ativa = aba === selecionada;
            aba.setAttribute("aria-selected", String(ativa));
            aba.tabIndex = ativa ? 0 : -1;
        });
        secoes.forEach(secao => {
            secao.hidden = secao.id !== selecionada.getAttribute("aria-controls");
        });
        if (moverFoco) selecionada.focus();
    }

    function mostrarCena(nome) {
        cenaAtual = nome;
        const cena = cenas[nome];
        ["dias", "horario", "tempo", "situacao", "explicacao"].forEach(campo => {
            escrever(campo, cena[campo]);
        });
        escrever("resumo-plano", `${cena.total} blocos na semana · 30 min cada`);
        escrever("aviso-plano", cena.aviso);
        escrever("numeros", `${cena.total} no período · ${cena.estudo} para estudo · ${cena.demanda} pedidos`);
        buscar("#exemplo-plano").dataset.estado = nome;
        buscar("#demonstracao-diagnostico").dataset.estado = nome;
        linhas.forEach(linha => {
            const quantidade = cena.blocos[linha.dataset.materia];
            linha.querySelector(".demonstracao-quantidade").textContent = `${quantidade} blocos`;
            const marcadores = Array.from({ length: quantidade }, () => document.createElement("span"));
            linha.querySelector(".demonstracao-marcadores").replaceChildren(...marcadores);
        });
        buscar('#exemplo-ajustes [data-acao="reduzir"]').hidden = nome !== "normal";
        buscar('#exemplo-ajustes [data-acao="ajustar"]').hidden = nome !== "reduzido";
        buscar('#exemplo-ajustes [data-acao="ver-plano"]').hidden = nome !== "ajustado";
    }

    painel.addEventListener("click", evento => {
        const botao = evento.target.closest("button");
        if (!botao || !painel.contains(botao) || botao.disabled) return;
        if (botao.dataset.aba) {
            selecionarAba(botao.dataset.aba);
        } else if (botao.id === "demonstracao-reiniciar") {
            mostrarCena("normal");
            selecionarAba("plano");
            anuncio.textContent = "Exemplo reiniciado. Rotina e distribuição originais restauradas.";
            botao.focus();
        } else if (botao.dataset.acao === "ver-plano") {
            selecionarAba("plano", true);
        } else if (botao.dataset.acao === "ver-ajustes") {
            selecionarAba("ajustes", true);
        } else {
            const reduzir = botao.dataset.acao === "reduzir" && cenaAtual === "normal";
            const ajustar = botao.dataset.acao === "ajustar" && cenaAtual === "reduzido";
            if (!reduzir && !ajustar) return;
            mostrarCena(reduzir ? "reduzido" : "ajustado");
            selecionarAba("ajustes");
            buscar("#demonstracao-situacao").focus();
            anuncio.textContent = cenas[cenaAtual].anuncio;
        }
    });

    buscar('[role="tablist"]').addEventListener("keydown", evento => {
        const indice = abas.indexOf(evento.target);
        if (indice === -1) return;
        const destinos = {
            ArrowRight: (indice + 1) % abas.length,
            ArrowLeft: (indice - 1 + abas.length) % abas.length,
            Home: 0,
            End: abas.length - 1
        };
        if (!Object.hasOwn(destinos, evento.key)) return;
        evento.preventDefault();
        selecionarAba(abas[destinos[evento.key]].dataset.aba, true);
    });

    mostrarCena("normal");
    selecionarAba("plano");
    painel.querySelectorAll("button[disabled]").forEach(botao => {
        botao.disabled = false;
    });
    escrever("instrucao", "Exemplo fictício. Nada é salvo.");
}
