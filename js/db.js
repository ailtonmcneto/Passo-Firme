const NOME_BANCO = 'passo-firme';
let abertura;

function abrirBanco() {
    if (abertura) return abertura;
    abertura = new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) {
            reject(new Error('Este navegador não permite salvar os dados. Abra a plataforma em um navegador com IndexedDB.'));
            return;
        }
        const pedido = indexedDB.open(NOME_BANCO, 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('sessao');
        pedido.onerror = () => reject(new Error('Não foi possível abrir seus dados neste navegador.'));
        pedido.onblocked = () => reject(new Error('Feche as outras abas da plataforma e recarregue esta página.'));
        pedido.onsuccess = () => {
            const banco = pedido.result;
            banco.onversionchange = () => { banco.close(); abertura = null; };
            // Pede ao navegador para não apagar os dados quando faltar espaço. Não espera a
            // resposta e ignora a recusa: sem a permissão, o salvamento funciona do mesmo jeito.
            // Os `?.` evitam erro onde essa função não existe: lá a chamada só devolve undefined.
            globalThis.navigator?.storage?.persist?.()?.catch(() => {});
            resolve(banco);
        };
    }).catch(erro => { abertura = null; throw erro; });
    return abertura;
}

export async function lerSessao() {
    const banco = await abrirBanco();
    return new Promise((resolve, reject) => {
        const transacao = banco.transaction('sessao', 'readonly');
        const pedido = transacao.objectStore('sessao').get('atual');
        transacao.oncomplete = () => resolve(pedido.result ?? null);
        transacao.onabort = () => reject(new Error('Não foi possível ler seus dados. Recarregue para tentar novamente.'));
    });
}

export async function gravarSessao(sessao, revisaoEsperada) {
    const banco = await abrirBanco();
    return new Promise((resolve, reject) => {
        const transacao = banco.transaction('sessao', 'readwrite');
        const store = transacao.objectStore('sessao');
        let conflito = false;
        const pedido = store.get('atual');
        pedido.onsuccess = () => {
            // A comparação e a escrita na mesma transação protegem contra outra aba.
            if ((pedido.result?.revisao ?? 0) !== revisaoEsperada) {
                conflito = true;
                transacao.abort();
                return;
            }
            try { store.put(sessao, 'atual'); }
            catch { transacao.abort(); }
        };
        transacao.oncomplete = () => resolve();
        transacao.onabort = () => reject(new Error(conflito
            ? 'Seus dados mudaram em outra aba. Recarregue esta página antes de continuar.'
            : 'Não foi possível salvar. Seus dados anteriores foram preservados. Tente novamente.'));
    });
}
