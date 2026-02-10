// ============================================================================
// PHONE NORMALIZER — Módulo Canônico de Normalização de Telefones
// ============================================================================
// REGRA DE OURO: TODO número de telefone no sistema DEVE passar por aqui.
// Uso: Browser (window.PhoneNormalizer) e Node.js (module.exports)
// ============================================================================

(function(root) {
    'use strict';

    /**
     * Normaliza telefone para formato canônico brasileiro.
     * Remove DDI, JID suffixes, caracteres especiais.
     * @param {string} raw - Número bruto ("+55 62 99999-8888" ou "556299998888@s.whatsapp.net")
     * @returns {string} Formato: DDXXXXXXXXX (10-11 dígitos) ou vazio
     */
    function normalize(raw) {
        if (!raw) return '';
        let str = String(raw);

        // 1. Remover sufixos de JID do WhatsApp
        str = str
            .replace(/@s\.whatsapp\.net/gi, '')
            .replace(/@c\.us/gi, '')
            .replace(/@g\.us/gi, '')
            .replace(/@lid/gi, '');

        // 2. Remover tudo que não é dígito
        let cleaned = str.replace(/\D/g, '');

        // 3. Remover DDI 55 se presente (>=12 dígitos = DDI + DDD + número)
        if (cleaned.startsWith('55') && cleaned.length >= 12) {
            cleaned = cleaned.substring(2);
        }

        // 4. Se ficou com mais de 11 dígitos, pegar últimos 11
        if (cleaned.length > 11) {
            cleaned = cleaned.slice(-11);
        }

        return cleaned;
    }

    /**
     * Gera phone_normalized canônico para persistência no banco.
     * Remove 9º dígito para manter um identificador estável.
     * Ex: 62999998888 → 6299998888 (10 dígitos: DDD + 8)
     *     6299998888 → 6299998888 (já sem 9º)
     * @param {string} raw - Número bruto
     * @returns {string} Formato: DDXXXXXXXX (10 dígitos) — sem 9º dígito
     */
    function canonical(raw) {
        const norm = normalize(raw);
        if (!norm) return '';
        // Se 11 dígitos (DDD + 9 + 8 dígitos), remover o 9 após DDD
        if (norm.length === 11 && norm.charAt(2) === '9') {
            return norm.substring(0, 2) + norm.substring(3);
        }
        return norm;
    }

    /**
     * Adiciona DDI 55 para envio via Evolution API.
     * @param {string} raw - Número bruto ou normalizado
     * @returns {string} Ex: "5562999998888"
     */
    function withDDI(raw) {
        const norm = normalize(raw);
        if (!norm) return '';
        if (norm.length >= 12 && norm.startsWith('55')) return norm;
        return '55' + norm;
    }

    /**
     * Formata para exibição humana.
     * @param {string} raw - Número bruto
     * @returns {string} Ex: "+55 (62) 99999-8888"
     */
    function display(raw) {
        const norm = normalize(raw);
        if (!norm || norm.length < 10) return norm || '—';
        const ddd = norm.substring(0, 2);
        const rest = norm.substring(2);
        if (rest.length === 9) {
            return `+55 (${ddd}) ${rest.substring(0, 5)}-${rest.substring(5)}`;
        }
        return `+55 (${ddd}) ${rest.substring(0, 4)}-${rest.substring(4)}`;
    }

    /**
     * Compara dois telefones ignorando variações de 9º dígito e DDI.
     * @param {string} a - Telefone A
     * @param {string} b - Telefone B
     * @returns {boolean}
     */
    function match(a, b) {
        if (!a || !b) return false;
        const na = normalize(a);
        const nb = normalize(b);
        if (na === nb) return true;
        // Canonical match (sem 9º dígito)
        if (canonical(a) === canonical(b)) return true;
        // Últimos 8 dígitos com mesmo DDD
        if (na.length >= 8 && nb.length >= 8 && na.slice(-8) === nb.slice(-8)) {
            const dddA = na.length >= 10 ? na.substring(0, 2) : '';
            const dddB = nb.length >= 10 ? nb.substring(0, 2) : '';
            if (!dddA || !dddB || dddA === dddB) return true;
        }
        return false;
    }

    /**
     * Gera todas as variações possíveis de um telefone (para busca no banco).
     * @param {string} raw - Número bruto
     * @returns {string[]} Array de variações
     */
    function variations(raw) {
        const norm = normalize(raw);
        if (!norm) return [];
        const set = new Set([norm]);
        // Com 9º dígito
        if (norm.length === 10) {
            set.add(norm.substring(0, 2) + '9' + norm.substring(2));
        }
        // Sem 9º dígito
        if (norm.length === 11 && norm.charAt(2) === '9') {
            set.add(norm.substring(0, 2) + norm.substring(3));
        }
        // Com DDI
        set.add('55' + norm);
        return [...set];
    }

    /**
     * Valida se é um telefone brasileiro válido (10-11 dígitos, DDD 11-99).
     * @param {string} raw
     * @returns {boolean}
     */
    function isValid(raw) {
        const norm = normalize(raw);
        if (norm.length < 10 || norm.length > 11) return false;
        const ddd = parseInt(norm.substring(0, 2), 10);
        return ddd >= 11 && ddd <= 99;
    }

    /**
     * Detecta se um JID é Lead ID do Meta (@lid) — NÃO contém telefone real.
     * @param {string} jid
     * @returns {boolean}
     */
    function isLid(jid) {
        return jid && String(jid).includes('@lid');
    }

    /**
     * Detecta se é um grupo WhatsApp.
     * @param {string} jid
     * @returns {boolean}
     */
    function isGroup(jid) {
        return jid && String(jid).includes('@g.us');
    }

    // ========================================================================
    // EXPORT
    // ========================================================================
    const PhoneNormalizer = {
        normalize,
        canonical,
        withDDI,
        display,
        match,
        variations,
        isValid,
        isLid,
        isGroup
    };

    // Universal module export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PhoneNormalizer;
    }
    if (typeof root !== 'undefined') {
        root.PhoneNormalizer = PhoneNormalizer;
    }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
