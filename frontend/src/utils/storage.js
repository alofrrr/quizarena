/**
 * storage.js
 * Utilitários de persistência local — wrappeia o localStorage com
 * tratamento de erros e serialização JSON automática.
 *
 * Por que um módulo separado?
 *   - Centraliza o try/catch em um único lugar
 *   - Facilita trocar por outro mecanismo no futuro (IndexedDB, cookie…)
 *   - Torna o código dos componentes mais limpo e legível
 */

/**
 * Salva qualquer valor JavaScript no localStorage.
 * JSON.stringify é necessário porque o storage só aceita strings.
 *
 * @param {string} chave       - Identificador único da entrada
 * @param {any}    dados       - Qualquer valor serializável (objeto, array, número…)
 * @returns {boolean}          - true se salvou, false em caso de erro
 */
export function salvarLocal(chave, dados) {
  try {
    localStorage.setItem(chave, JSON.stringify(dados));
    return true;
  } catch (erro) {
    // Situações que chegam aqui:
    //   • Modo anônimo/privado bloqueando o storage
    //   • Cota excedida (~5 MB por origem)
    //   • Objeto com referência circular que JSON.stringify não consegue serializar
    console.warn('[storage] Não foi possível salvar "' + chave + '":', erro.message);
    return false;
  }
}

/**
 * Recupera e desserializa um item do localStorage.
 * Retorna valorPadrao quando a chave não existe ou os dados estão corrompidos.
 *
 * @param {string} chave         - Identificador usado no momento do salvamento
 * @param {any}    valorPadrao   - Retornado quando a chave está ausente (evita null solto)
 * @returns {any}
 */
export function carregarLocal(chave, valorPadrao = null) {
  try {
    const bruto = localStorage.getItem(chave);

    // getItem retorna null quando a chave não existe
    if (bruto === null) return valorPadrao;

    // JSON.parse reconstrói o objeto original a partir da string
    return JSON.parse(bruto);
  } catch (erro) {
    // JSON.parse lança SyntaxError se o texto estiver corrompido
    console.warn('[storage] Não foi possível carregar "' + chave + '":', erro.message);
    return valorPadrao;
  }
}

/**
 * Remove uma entrada do localStorage.
 *
 * @param {string} chave - Identificador a ser removido
 */
export function removerLocal(chave) {
  try {
    localStorage.removeItem(chave);
  } catch (erro) {
    console.warn('[storage] Não foi possível remover "' + chave + '":', erro.message);
  }
}
