// Modo de demonstração nas páginas: com ?hoje=YYYY-MM-DD na URL, os links para as outras
// páginas do site levam o mesmo ?hoje, para o modo não desligar no meio da apresentação.
// Usado pela plataforma (js/plataforma.js) e pela página inicial (index.html).
import { lerHojeDaUrl, comHoje } from './textos.js';

// Recebe a parte "?..." da URL (location.search); se o modo de demonstração estiver ligado,
// reescreve os links da página com o ?hoje. Sem ?hoje válido, não faz nada.
// Ex.: em plataforma.html?hoje=2026-12-04, o link "../index.html" vira
//      "../index.html?hoje=2026-12-04".
export function manterHojeNosLinks(search) {
    // A data real não importa aqui: sem data simulada, os links ficam como estão.
    const { hoje, simulado } = lerHojeDaUrl(search, null);
    if (!simulado) return;
    for (const link of document.querySelectorAll('a[href]')) {
        // getAttribute devolve o href como foi escrito no HTML (relativo), e não a URL completa.
        // O link "sair do modo" é marcado para ficar sem o ?hoje.
        if (link.dataset.semHoje !== undefined) continue;
        link.setAttribute('href', comHoje(link.getAttribute('href'), hoje));
    }
}
