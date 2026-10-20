const palavra = document.querySelector("#pf-word");
const trilha = document.querySelector("#pf-footprints");
const secaoPrincipal = document.querySelector(".pf-hero");

if (!palavra || !trilha || !secaoPrincipal) {
    console.error("Elementos não encontrados no DOM.");
} else {
    iniciarAnimacoes();
}

function iniciarAnimacoes() {
    const imagemPegadas = "./img/pegadas.png";

    const palavras = [
        "conquistas",
        "constância",
        "progresso"
    ];

    const intervaloTexto = 3000;
    const intervaloPassos = 520;
    const pausaDoLoop = 1000;
    const duracaoPegada = 4600;

    const movimentoReduzido = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    );

    const telaPequena = window.matchMedia(
        "(max-width: 760px)"
    );

    let indicePalavra = 0;
    let passoAtual = 0;

    let timerTexto;
    let timerPassos;
    let animacaoTexto;

    let secaoVisivel = false;
    let imagemCarregada = false;

    let execucao = 0;

    const totalPassos = 16;

    const caminho = Array.from(
        { length: totalPassos },
        (_, indice) => {
            const progresso = indice / (totalPassos - 1);

            const x =
                0.48 +
                Math.sin(progresso * Math.PI * 1.4) * 0.14;

            const y = 1.12 - progresso * 1.28;

            const angulo =
                Math.cos(progresso * Math.PI * 1.4) * 13;

            return { x, y, angulo };
        }
    );

    async function trocarPalavra() {
        const execucaoAtual = execucao;

        try {
            animacaoTexto = palavra.animate(
                [
                    {
                        opacity: 1,
                        transform: "translateY(0)"
                    },
                    {
                        opacity: 0,
                        transform: "translateY(-12px)"
                    }
                ],
                {
                    duration: 240,
                    easing: "ease-in",
                    fill: "forwards"
                }
            );

            await animacaoTexto.finished;

            if (execucaoAtual !== execucao) return;

            indicePalavra =
                (indicePalavra + 1) % palavras.length;

            palavra.textContent = palavras[indicePalavra];

            animacaoTexto.cancel();

            animacaoTexto = palavra.animate(
                [
                    {
                        opacity: 0,
                        transform: "translateY(12px)"
                    },
                    {
                        opacity: 1,
                        transform: "translateY(0)"
                    }
                ],
                {
                    duration: 350,
                    easing: "ease-out"
                }
            );

            await animacaoTexto.finished;

            if (execucaoAtual !== execucao) return;

            timerTexto = setTimeout(
                trocarPalavra,
                intervaloTexto
            );
        } catch {
            
        }
    }

    function criarPegada() {
        const { x, y, angulo } = caminho[passoAtual];
        const esquerdo = passoAtual % 2 === 0;
        const larguraFaixa =
            trilha.clientWidth *
            (telaPequena.matches ? 0.24 : 0.46);

        const separacao =
            telaPequena.matches ? 12 : 25;
        const deslocamento =
            esquerdo ? -separacao : separacao;

        const pegada = document.createElement("span");

        pegada.className = esquerdo
            ? "pf-footprint pf-left"
            : "pf-footprint pf-right";

        const imagem = document.createElement("img");

        imagem.src = imagemPegadas;
        imagem.alt = "";
        imagem.draggable = false;

        pegada.appendChild(imagem);

        pegada.style.left =
            `${x * larguraFaixa + deslocamento}px`;

        pegada.style.top = `${y * 100}%`;

        const posicao =
            `translate(-50%, -50%) rotate(${angulo}deg)`;

    
        pegada.style.transform = posicao;

        trilha.appendChild(pegada);

        const animacao = pegada.animate(
            [
                {
                    opacity: 0,
                    transform: `${posicao} scale(0.94)`,
                    offset: 0
                },
                {
                    opacity: 0.30,
                    transform: `${posicao} scale(1)`,
                    offset: 0.08
                },
                {
                    opacity: 0.30,
                    transform: `${posicao} scale(1)`,
                    offset: 0.64
                },
                {
                    opacity: 0,
                    transform: `${posicao} scale(1)`,
                    offset: 1
                }
            ],
            {
                duration: duracaoPegada,
                easing: "ease-out"
            }
        );

        animacao.onfinish = () => pegada.remove();

        passoAtual =
            (passoAtual + 1) % caminho.length;

        const espera =
            passoAtual === 0
                ? pausaDoLoop
                : intervaloPassos;

        timerPassos = setTimeout(
            criarPegada,
            espera
        );
    }

    function pararAnimacoes() {
        execucao++;

        clearTimeout(timerTexto);
        clearTimeout(timerPassos);

        animacaoTexto?.cancel();

        for (const pegada of trilha.children) {
            pegada.getAnimations().forEach(
                animacao => animacao.cancel()
            );
        }

        trilha.replaceChildren();
    }

    function atualizarAnimacoes() {
        pararAnimacoes();

        if (movimentoReduzido.matches) {
            indicePalavra = 0;
            palavra.textContent = palavras[0];
            return;
        }

        if (document.hidden || !secaoVisivel) return;

        timerTexto = setTimeout(
            trocarPalavra,
            intervaloTexto
        );

        if (imagemCarregada) {
            passoAtual = 0;
            criarPegada();
        }
    }

    const observador = new IntersectionObserver(
        ([entrada]) => {
            const novoEstado = entrada.isIntersecting;

            if (novoEstado !== secaoVisivel) {
                secaoVisivel = novoEstado;
                atualizarAnimacoes();
            }
        }
    );

    observador.observe(secaoPrincipal);

    document.addEventListener(
        "visibilitychange",
        atualizarAnimacoes
    );

    movimentoReduzido.addEventListener(
        "change",
        atualizarAnimacoes
    );

    telaPequena.addEventListener(
        "change",
        atualizarAnimacoes
    );

    const carregarImagem = new Image();

    carregarImagem.onload = () => {
        imagemCarregada = true;
        atualizarAnimacoes();
    };

    carregarImagem.onerror = () => {
        console.error(
            "Não foi possível carregar as pegadas. " +
            "Confira o arquivo img/pegadas.png."
        );
    };

    carregarImagem.src = imagemPegadas;
}
