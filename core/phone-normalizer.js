// ============================================================================
// PHONE NORMALIZER — Módulo Canônico de Normalização de Telefones (CORRIGIDO)
// ============================================================================
// REGRA DE OURO: TODO número de telefone no sistema DEVE passar por aqui.
// Uso: Browser (window.PhoneNormalizer) e Node.js (module.exports)
// VERSÃO: 2.0 - Correção Completa (Prompt 300%)
// ============================================================================

(function(root) {
    'use strict';

    // DDDs válidos do Brasil
    const VALID_DDDS = [
        11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
        21, 22, 24, // RJ
        27, 28, // ES
        31, 32, 33, 34, 35, 37, 38, // MG
        41, 42, 43, 44, 45, 46, // PR
        47, 48, 49, // SC
        51, 53, 54, 55, // RS
        61, // DF
        62, 64, // GO
        63, // TO
        65, 66, // MT
        67, // MS
        68, // AC
        69, // RO
        71, 73, 74, 75, 77, // BA
        79, // SE
        81, 87, // PE
        82, // AL
        83, // PB
        84, // RN
        85, 88, // CE
        86, 89, // PI
        91, 93, 94, // PA
        92, 97, // AM
        95, // RR
        96, // AP
        98, 99  // MA
    ];

    /**
     * Normaliza telefone para formato canônico brasileiro com validação completa.
     * @param {string} raw - Número bruto ("+55 62 99999-8888" ou "556299998888@s.whatsapp.net")
     * @returns {string} Formato: 5562999998888 (13 dígitos: DDI + DDD + número)
     * @throws {Error} Se número for inválido
     */
    function normalize(raw) {
        try {
            if (!raw) {
                throw new Error('Número não fornecido');
            }

            // Converter para string
            let phone = String(raw).trim();

            // 1. CRÍTICO: @lid são IDs internos do Meta, NÃO contêm telefone real
            if (phone.includes('@lid')) {
                throw new Error('JID @lid (Meta Ads) não contém telefone real');
            }

            // 2. Remover sufixos de JID do WhatsApp
            phone = phone.replace('@s.whatsapp.net', '');
            phone = phone.replace('@g.us', '');
            phone = phone.replace('@c.us', '');
            phone = phone.replace('@broadcast', '');

            // 3. Remover todos os caracteres não numéricos
            phone = phone.replace(/\D/g, '');

            // 4. Remover zeros à esquerda
            phone = phone.replace(/^0+/, '');

            // 5. Remover DDI duplicado (5555...)
            if (phone.startsWith('5555')) {
                phone = phone.substring(2);
            }

            // 6. Adicionar DDI 55 se não tiver
            if (!phone.startsWith('55')) {
                phone = '55' + phone;
            }

            // 7. Validar comprimento (deve ter 13 dígitos: 55 + DDD + 9 dígitos)
            if (phone.length !== 13) {
                // Tentar corrigir caso comum: falta o 9 do celular (12 dígitos)
                if (phone.length === 12) {
                    const ddd = phone.substring(2, 4);
                    const number = phone.substring(4);
                    
                    // Se o número começa com 8 ou 9, adicionar 9
                    if (number.startsWith('8') || number.startsWith('9')) {
                        phone = '55' + ddd + '9' + number;
                    }
                }
                
                // Ainda inválido?
                if (phone.length !== 13) {
                    throw new Error(`Comprimento inválido: ${phone.length} (esperado 13)`);
                }
            }

            // 8. Validar DDD
            const ddd = parseInt(phone.substring(2, 4));
            if (!VALID_DDDS.includes(ddd)) {
                console.warn('[PhoneNormalizer] ⚠️ DDD suspeito:', ddd);
                // Não bloquear, apenas avisar
            }

            // 9. Validar 9º dígito (celulares)
            const ninthDigit = phone.charAt(4);
            if (ninthDigit !== '9' && ninthDigit !== '8' && ninthDigit !== '7') {
                console.warn('[PhoneNormalizer] ⚠️ 9º dígito inválido:', ninthDigit);
            }

            return phone;

        } catch (error) {
            console.error('[PhoneNormalizer] ❌ Erro ao normalizar:', raw, error.message);
            throw error;
        }
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
        try {
            const na = normalize(a);
            const nb = normalize(b);
            if (na === nb) return true;
            
            // Match pelos últimos 9 dígitos
            const last9a = na.slice(-9);
            const last9b = nb.slice(-9);
            return last9a === last9b;
        } catch (error) {
            return false;
        }
    }

    /**
     * Extrai número limpo de um JID
     * @param {string} jid - Remote JID (ex: 5562999998888@s.whatsapp.net)
     * @returns {string} - Número normalizado
     */
    function extractFromJid(jid) {
        if (!jid) return null;
        
        try {
            // Remover sufixo
            let phone = jid.split('@')[0];
            
            // Normalizar
            return normalize(phone);
            
        } catch (error) {
            console.error('[PhoneNormalizer] ❌ Erro ao extrair JID:', jid, error);
            return null;
        }
    }

    /**
     * Formata número para exibição
     * @param {string} phone - Número normalizado (13 dígitos)
     * @returns {string} - Formato: +55 (62) 99999-8888
     */
    function format(phone) {
        try {
            const normalized = normalize(phone);
            
            const ddi = normalized.substring(0, 2);
            const ddd = normalized.substring(2, 4);
            const part1 = normalized.substring(4, 9);
            const part2 = normalized.substring(9, 13);
            
            return `+${ddi} (${ddd}) ${part1}-${part2}`;
            
        } catch (error) {
            return phone; // Retornar original se falhar
        }
    }

    /**
     * Valida se número é válido
     * @param {string} phone - Número para validar
     * @returns {boolean}
     */
    function isValid(phone) {
        try {
            normalize(phone);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Compara dois números (ignora formatação)
     * @param {string} phone1
     * @param {string} phone2
     * @returns {boolean}
     */
    function areEqual(phone1, phone2) {
        try {
            const norm1 = normalize(phone1);
            const norm2 = normalize(phone2);
            return norm1 === norm2;
        } catch (error) {
            return false;
        }
    }

    /**
     * Match flexível (últimos 9 dígitos)
     * @param {string} phone1
     * @param {string} phone2
     * @returns {boolean}
     */
    function matchLast9(phone1, phone2) {
        try {
            const norm1 = normalize(phone1);
            const norm2 = normalize(phone2);
            
            const last9_1 = norm1.slice(-9);
            const last9_2 = norm2.slice(-9);
            
            return last9_1 === last9_2;
            
        } catch (error) {
            return false;
        }
    }

    /**
     * Converte número para JID WhatsApp
     * @param {string} phone - Número
     * @param {boolean} isGroup - Se é grupo
     * @returns {string} - JID completo
     */
    function toJid(phone, isGroup = false) {
        try {
            const normalized = normalize(phone);
            const suffix = isGroup ? '@g.us' : '@s.whatsapp.net';
            return normalized + suffix;
            
        } catch (error) {
            console.error('[PhoneNormalizer] ❌ Erro ao converter para JID:', error);
            return null;
        }
    }

    /**
     * Detecta se JID é de grupo
     * @param {string} jid
     * @returns {boolean}
     */
    function isGroup(jid) {
        return jid && jid.includes('@g.us');
    }

    /**
     * Detecta se JID é de broadcast/lista
     * @param {string} jid
     * @returns {boolean}
     */
    function isBroadcast(jid) {
        return jid && jid.includes('@broadcast');
    }

    /**
     * Detecta se JID é de status (stories)
     * @param {string} jid
     * @returns {boolean}
     */
    function isStatus(jid) {
        return jid && jid.includes('status@broadcast');
    }

    /**
     * Limpa lista de números (remove inválidos)
     * @param {Array<string>} phones - Lista de números
     * @returns {Array<string>} - Lista normalizada
     */
    function cleanList(phones) {
        if (!Array.isArray(phones)) return [];
        
        return phones
            .map(p => {
                try {
                    return normalize(p);
                } catch (error) {
                    console.warn('[PhoneNormalizer] ⚠️ Número inválido ignorado:', p);
                    return null;
                }
            })
            .filter(p => p !== null);
    }

    /**
     * Gera todas as variações possíveis de um telefone (para busca no banco).
     * @param {string} raw - Número bruto
     * @returns {string[]} Array de variações
     */
    function variations(raw) {
        try {
            const norm = normalize(raw);
            const set = new Set([norm]);
            
            // Variações com/sem 9º dígito
            if (norm.length === 12) {
                set.add(norm.substring(0, 4) + '9' + norm.substring(4));
            }
            if (norm.length === 13 && norm.charAt(4) === '9') {
                set.add(norm.substring(0, 4) + norm.substring(5));
            }
            
            return [...set];
        } catch (error) {
            return [];
        }
    }

    // ========================================================================
    // EXPORT
    // ========================================================================
    const PhoneNormalizer = {
        normalize,
        canonical,
        withDDI,
        display,
        format,
        match,
        extractFromJid,
        isValid,
        areEqual,
        matchLast9,
        toJid,
        isGroup,
        isBroadcast,
        isStatus,
        cleanList,
        variations
    };

    // Universal module export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PhoneNormalizer;
    }
    if (typeof root !== 'undefined') {
        root.PhoneNormalizer = PhoneNormalizer;
    }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);

