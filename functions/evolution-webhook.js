// ============================================================================
// EVOLUTION WEBHOOK - Receptor Universal de Eventos (Camada 1)
// Captura TODOS os eventos do Evolution API, normaliza e enfileira
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const PhoneNormalizer = require('../core/phone-normalizer');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORCHESTRATOR_URL = process.env.URL  // Netlify URL auto
    ? `${process.env.URL}/.netlify/functions/ai-orchestrator`
    : null;

// N8N Relay — encaminha o payload original para o N8N continuar funcionando
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL 
    || 'https://cjota-n8n.9eo9b2.easypanel.host/webhook-test/Agente Anne';

const supabase = SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ============================================================================
// LID RESOLVER — Buscar número real de contatos @lid (anúncios Meta)
// ============================================================================
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api.cjota.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'EB6B5AB56A35-43C4-B590-1188166D4E7A';

async function resolvePhoneFromLid(lidJid, instanceName) {
    if (!lidJid || !lidJid.includes('@lid')) return '';
    try {
        console.log(`[LID Resolver] Buscando número real para: ${lidJid}`);
        const response = await fetch(
            `${EVOLUTION_URL}/chat/findContacts/${instanceName}`,
            {
                method: 'POST',
                headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ where: { id: lidJid } })
            }
        );
        if (!response.ok) {
            console.warn(`[LID Resolver] HTTP ${response.status}`);
            return '';
        }
        const data = await response.json();
        const contacts = Array.isArray(data) ? data : (data.data || []);
        if (contacts.length === 0) {
            console.warn(`[LID Resolver] Nenhum contato para ${lidJid}`);
            return '';
        }
        const contact = contacts[0];
        let realPhone = '';
        if (contact.id && !contact.id.includes('@lid')) {
            realPhone = contact.id.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        } else if (contact.notify && /\d{10,}/.test(contact.notify)) {
            realPhone = contact.notify.replace(/\D/g, '');
        }
        if (realPhone) {
            console.log(`[LID Resolver] ✅ Número real: ${lidJid} → ${realPhone}`);
        }
        return realPhone;
    } catch (error) {
        console.error(`[LID Resolver] Erro:`, error.message);
        return '';
    }
}

// ============================================================================
// NORMALIZAÇÃO DE EVENTOS
// ============================================================================

async function normalizeEvent(payload) {
    // Evolution API envia diferentes formatos dependendo do evento
    const event = payload.event || payload.apiType || 'unknown';
    const instance = payload.instance || payload.instanceName || '';
    const data = payload.data || payload;

    // Detectar tipo de evento
    let tipo, origem, conteudo, contexto;

    switch (event) {
        case 'messages.upsert':
        case 'MESSAGES_UPSERT': {
            const msg = data.message || data;
            const key = msg.key || {};
            const messageContent = msg.message || {};
            const isFromMe = key.fromMe === true;

            // Determinar tipo de conteúdo
            if (messageContent.conversation || messageContent.extendedTextMessage) {
                tipo = 'mensagem_texto';
            } else if (messageContent.audioMessage) {
                tipo = 'mensagem_audio';
            } else if (messageContent.imageMessage) {
                tipo = 'mensagem_imagem';
            } else if (messageContent.documentMessage || messageContent.documentWithCaptionMessage) {
                tipo = 'mensagem_documento';
            } else if (messageContent.videoMessage) {
                tipo = 'mensagem_video';
            } else if (messageContent.stickerMessage) {
                tipo = 'mensagem_sticker';
            } else if (messageContent.contactMessage || messageContent.contactsArrayMessage) {
                tipo = 'mensagem_contato';
            } else if (messageContent.locationMessage) {
                tipo = 'mensagem_localizacao';
            } else if (messageContent.reactionMessage) {
                tipo = 'reacao';
            } else if (messageContent.protocolMessage) {
                tipo = messageContent.protocolMessage.type === 0 ? 'mensagem_deletada' : 'protocolo';
            } else {
                tipo = 'mensagem_outros';
            }

            // Extrair texto
            const texto = messageContent.conversation
                || messageContent.extendedTextMessage?.text
                || messageContent.imageMessage?.caption
                || messageContent.videoMessage?.caption
                || messageContent.documentWithCaptionMessage?.message?.documentMessage?.caption
                || '';

            // Resolver número: @lid precisa de lookup especial
            const isLid = (key.remoteJid || '').includes('@lid');
            let phoneNumber = '';
            let phoneNormalized = '';
            let phoneDDI = '';

            if (isLid) {
                console.log(`[Webhook] 🔍 Detectado @lid: ${key.remoteJid}`);
                const realPhone = await resolvePhoneFromLid(key.remoteJid, instance);
                if (realPhone) {
                    phoneNumber = PhoneNormalizer.normalize(realPhone);
                    phoneNormalized = PhoneNormalizer.canonical(realPhone);
                    phoneDDI = PhoneNormalizer.withDDI(realPhone);
                    console.log(`[Webhook] ✅ Número real resolvido: ${phoneNumber}`);
                } else {
                    console.warn(`[Webhook] ⚠️ Não resolveu @lid, usando JID como fallback`);
                    phoneNumber = key.remoteJid;
                    phoneNormalized = '';
                    phoneDDI = '';
                }
            } else {
                phoneNumber = PhoneNormalizer.normalize(key.remoteJid || '');
                phoneNormalized = PhoneNormalizer.canonical(key.remoteJid || '');
                phoneDDI = PhoneNormalizer.withDDI(key.remoteJid || '');
            }

            origem = {
                numero: phoneNumber,
                numero_ddi: phoneDDI,
                phone_normalized: phoneNormalized,
                jid: key.remoteJid || '',
                nome: msg.pushName || data.pushName || '',
                plataforma: 'whatsapp',
                instancia: instance,
                is_from_me: isFromMe,
                is_group: (key.remoteJid || '').includes('@g.us'),
                is_lid: isLid
            };

            conteudo = {
                texto,
                audio_url: messageContent.audioMessage?.url || null,
                imagem_url: messageContent.imageMessage?.url || null,
                documento_url: messageContent.documentMessage?.url || null,
                video_url: messageContent.videoMessage?.url || null,
                mimetype: messageContent.audioMessage?.mimetype
                    || messageContent.imageMessage?.mimetype
                    || messageContent.documentMessage?.mimetype
                    || null,
                duracao_audio: messageContent.audioMessage?.seconds || null,
                is_ptt: messageContent.audioMessage?.ptt || false,
                metadata: {
                    message_type: tipo,
                    quoted: messageContent.extendedTextMessage?.contextInfo?.quotedMessage ? true : false,
                    mentioned: messageContent.extendedTextMessage?.contextInfo?.mentionedJid || [],
                    raw_type: Object.keys(messageContent)[0]
                }
            };

            contexto = {
                timestamp: new Date(data.messageTimestamp
                    ? data.messageTimestamp * 1000
                    : Date.now()),
                mensagem_id: key.id || '',
                em_resposta_a: messageContent.extendedTextMessage?.contextInfo?.stanzaId || null,
                mencoes: messageContent.extendedTextMessage?.contextInfo?.mentionedJid || []
            };
            break;
        }

        case 'messages.update':
        case 'MESSAGES_UPDATE': {
            tipo = 'status_mensagem';
            const updateData = Array.isArray(data) ? data[0] : data;
            origem = {
                numero: PhoneNormalizer.normalize((updateData?.key?.remoteJid || '')),
                phone_normalized: PhoneNormalizer.canonical((updateData?.key?.remoteJid || '')),
                jid: updateData?.key?.remoteJid || '',
                plataforma: 'whatsapp',
                instancia: instance
            };
            conteudo = {
                status: updateData?.update?.status,
                metadata: { raw: updateData }
            };
            contexto = {
                timestamp: new Date(),
                mensagem_id: updateData?.key?.id || ''
            };
            break;
        }

        case 'presence.update':
        case 'PRESENCE_UPDATE': {
            tipo = data.status === 'composing' ? 'cliente_digitando' : 'cliente_online';
            origem = {
                numero: PhoneNormalizer.normalize((data.id || '')),
                phone_normalized: PhoneNormalizer.canonical((data.id || '')),
                jid: data.id || '',
                plataforma: 'whatsapp',
                instancia: instance
            };
            conteudo = {
                status: data.status, // composing, available, unavailable
                metadata: {}
            };
            contexto = { timestamp: new Date(), mensagem_id: '' };
            break;
        }

        case 'groups.upsert':
        case 'GROUPS_UPSERT': {
            tipo = 'grupo_criado';
            origem = {
                numero: data.id || '',
                jid: data.id || '',
                nome: data.subject || '',
                plataforma: 'whatsapp',
                instancia: instance
            };
            conteudo = {
                texto: data.subject || '',
                metadata: { participants: data.participants, owner: data.owner }
            };
            contexto = { timestamp: new Date(), mensagem_id: '' };
            break;
        }

        case 'connection.update':
        case 'CONNECTION_UPDATE': {
            tipo = 'conexao_atualizada';
            origem = { plataforma: 'whatsapp', instancia: instance };
            conteudo = {
                status: data.state || data.status,
                metadata: { raw: data }
            };
            contexto = { timestamp: new Date(), mensagem_id: '' };
            break;
        }

        default: {
            tipo = `evento_${event.toLowerCase().replace(/\./g, '_')}`;
            origem = { plataforma: 'whatsapp', instancia: instance };
            conteudo = { metadata: { raw: data } };
            contexto = { timestamp: new Date(), mensagem_id: '' };
        }
    }

    return { tipo, origem, conteudo, contexto };
}

// ============================================================================
// ENRIQUECIMENTO COM DADOS SUPABASE
// ============================================================================

async function enrichWithContext(normalized) {
    if (!supabase || !normalized.origem.numero) return normalized;

    try {
        const telefone = normalized.origem.numero;
        const phoneNorm = normalized.origem.phone_normalized || PhoneNormalizer.canonical(telefone);
        const phoneVariations = PhoneNormalizer.variations(telefone);

        // Buscar perfil do cliente + sessão ativa em paralelo
        // Tentar primeiro por phone_normalized (index), fallback para variações
        const [perfilRes, sessaoRes] = await Promise.all([
            supabase.from('clientes_perfil')
                .select('id,nome,tier,tags,ticket_medio,total_gasto,total_pedidos,ultima_compra,nivel_engajamento')
                .or(`phone_normalized.eq.${phoneNorm},telefone.in.(${phoneVariations.join(',')})`)
                .maybeSingle(),
            supabase.from('sessoes_ativas')
                .select('id,agente_atual,contexto_ativo,mensagens')
                .or(`cliente_telefone.in.(${phoneVariations.join(',')})`)
                .eq('status', 'ativa')
                .maybeSingle()
        ]);

        normalized.enriquecimento = {
            perfil_cliente: perfilRes.data || null,
            sessao_ativa: sessaoRes.data || null,
            is_cliente_conhecido: !!perfilRes.data,
            is_vip: perfilRes.data?.tier === 'diamante' || perfilRes.data?.tier === 'ouro',
            tem_sessao_ativa: !!sessaoRes.data
        };
    } catch (err) {
        console.error('[ENRICH] Erro:', err.message);
        normalized.enriquecimento = null;
    }

    return normalized;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const payload = JSON.parse(event.body || '{}');
        
        console.log(`[EVOLUTION-WH] Evento recebido: ${payload.event || 'unknown'}`);

        // 0. Relay para N8N (fire-and-forget — não bloqueia o fluxo)
        if (N8N_WEBHOOK_URL) {
            fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: event.body
            }).catch(err => console.error('[EVOLUTION-WH] Relay N8N falhou:', err.message));
        }

        // 1. Normalizar evento
        const normalized = await normalizeEvent(payload);
        
        // Ignorar mensagens enviadas por nós mesmos e eventos de protocolo
        if (normalized.origem.is_from_me || normalized.tipo === 'protocolo') {
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true }) };
        }

        // Ignorar grupos (opcional - pode ser configurável)
        // if (normalized.origem.is_group) { ... }

        // 2. Enriquecer com contexto do Supabase
        const enriched = await enrichWithContext(normalized);

        // 3. Persistir evento bruto (auditoria)
        let eventoId = null;
        if (supabase) {
            const { data: inserted, error } = await supabase.from('eventos_brutos').insert({
                tipo: enriched.tipo,
                origem: enriched.origem,
                conteudo: enriched.conteudo,
                contexto: enriched.contexto,
                processado: false
            }).select('id').single();

            if (!error && inserted) eventoId = inserted.id;
            if (error) console.error('[EVOLUTION-WH] Erro ao persistir:', error.message);
        }

        // 4. Encaminhar para o Orquestrador (mensagens de texto e áudio)
        const tiposProcessaveis = [
            'mensagem_texto', 'mensagem_audio', 'mensagem_imagem', 'mensagem_documento'
        ];

        let orchestratorResponse = null;

        if (tiposProcessaveis.includes(enriched.tipo) && ORCHESTRATOR_URL) {
            try {
                const orchRes = await fetch(ORCHESTRATOR_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'process_event',
                        evento: enriched,
                        evento_id: eventoId
                    })
                });
                orchestratorResponse = await orchRes.json();

                // Marcar como processado
                if (supabase && eventoId) {
                    await supabase.from('eventos_brutos')
                        .update({ processado: true, agente_designado: orchestratorResponse.agente })
                        .eq('id', eventoId);
                }
            } catch (orchErr) {
                console.error('[EVOLUTION-WH] Erro ao chamar orquestrador:', orchErr.message);
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                tipo: enriched.tipo,
                evento_id: eventoId,
                processado: !!orchestratorResponse,
                agente: orchestratorResponse?.agente || null
            })
        };

    } catch (error) {
        console.error('[EVOLUTION-WH] Erro fatal:', error.message);
        return {
            statusCode: 200, // Sempre 200 para o Evolution não reenviar
            headers,
            body: JSON.stringify({ ok: false, error: error.message })
        };
    }
};
