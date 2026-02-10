// ============================================================================
// MESSAGE SEQUENCE BUILDER — Componente Reutilizável de Sequência de Mensagens
// ============================================================================
// Uso compartilhado: Campanhas, Envio Rápido, Automações
// Responsabilidade: Montar sequência de blocos + executar envio via Evolution API
// ============================================================================

(function(root) {
    'use strict';

    // ========================================================================
    // TIPOS DE BLOCO SUPORTADOS
    // ========================================================================
    const BLOCK_TYPES = {
        text: { icon: '💬', label: 'Texto', hasText: true },
        image: { icon: '🖼️', label: 'Imagem', hasMedia: true, hasCaption: true },
        video: { icon: '🎥', label: 'Vídeo', hasMedia: true, hasCaption: true },
        audio: { icon: '🎵', label: 'Áudio PTT', hasMedia: true },
        poll:  { icon: '📊', label: 'Enquete', hasPoll: true },
        sticker:{ icon: '✨', label: 'Figurinha', hasMedia: true },
        delay: { icon: '⏱️', label: 'Delay', hasDelay: true },
        presence:{ icon: '👁️', label: 'Presença', hasPresence: true }
    };

    // ========================================================================
    // CLASSE PRINCIPAL
    // ========================================================================
    class MessageSequenceBuilder {
        /**
         * @param {Object} options
         * @param {string} options.containerId - ID do container DOM
         * @param {Function} [options.onUpdate] - Callback quando blocos mudam
         * @param {string} [options.apiBase] - Base URL da API (default: '/api')
         * @param {string} [options.instanceName] - Instance name da Evolution API
         */
        constructor(options = {}) {
            this.containerId = options.containerId || 'sequenceBlocks';
            this.onUpdate = options.onUpdate || null;
            this.apiBase = options.apiBase || '/api';
            this.instanceName = options.instanceName || 'Cjota';
            this.blocks = [];
            this._idCounter = 0;
        }

        /**
         * Adicionar um bloco à sequência
         * @param {string} type - Tipo do bloco (text, image, audio, etc.)
         * @param {Object} [config] - Configuração inicial
         * @returns {Object} O bloco criado
         */
        addBlock(type, config = {}) {
            if (!BLOCK_TYPES[type]) throw new Error(`Tipo de bloco inválido: ${type}`);
            
            const defaults = {
                text: { text: '' },
                image: { base64: null, caption: '', url: null },
                video: { base64: null, caption: '', url: null },
                audio: { base64: null, url: null },
                poll: { title: '', options: ['', ''], selectableCount: 1 },
                sticker: { base64: null, url: null },
                delay: { seconds: 5 },
                presence: { presenceType: 'composing', seconds: 3 }
            };

            const block = {
                id: `block_${++this._idCounter}_${Date.now()}`,
                type,
                config: { ...defaults[type], ...config }
            };

            this.blocks.push(block);
            this._notifyUpdate();
            return block;
        }

        /**
         * Remover um bloco
         * @param {number} index
         */
        removeBlock(index) {
            if (index < 0 || index >= this.blocks.length) return;
            this.blocks.splice(index, 1);
            this._notifyUpdate();
        }

        /**
         * Mover bloco para cima ou para baixo
         * @param {number} index
         * @param {number} direction - -1 (cima) ou +1 (baixo)
         */
        moveBlock(index, direction) {
            const newIndex = index + direction;
            if (newIndex < 0 || newIndex >= this.blocks.length) return;
            [this.blocks[index], this.blocks[newIndex]] = [this.blocks[newIndex], this.blocks[index]];
            this._notifyUpdate();
        }

        /**
         * Atualizar configuração de um bloco
         * @param {number} index
         * @param {string} key
         * @param {*} value
         */
        updateBlockConfig(index, key, value) {
            if (!this.blocks[index]) return;
            this.blocks[index].config[key] = value;
            this._notifyUpdate();
        }

        /**
         * Obter blocos serializados para envio ao backend
         * @returns {Array}
         */
        serialize() {
            return this.blocks.map(b => ({
                type: b.type,
                config: { ...b.config }
            }));
        }

        /**
         * Carregar blocos de uma serialização
         * @param {Array} serialized
         */
        load(serialized) {
            this.blocks = [];
            (serialized || []).forEach(b => {
                this.addBlock(b.type, b.config);
            });
        }

        /**
         * Reset — limpar todos os blocos
         */
        clear() {
            this.blocks = [];
            this._notifyUpdate();
        }

        /**
         * Validar se a sequência está pronta para envio
         * @returns {{ valid: boolean, errors: string[] }}
         */
        validate() {
            const errors = [];
            if (this.blocks.length === 0) {
                errors.push('Adicione pelo menos um bloco');
            }
            
            this.blocks.forEach((block, idx) => {
                const meta = BLOCK_TYPES[block.type];
                if (meta.hasText && !block.config.text?.trim()) {
                    errors.push(`Bloco #${idx + 1} (${meta.label}): texto vazio`);
                }
                if (meta.hasMedia && !block.config.base64 && !block.config.url) {
                    errors.push(`Bloco #${idx + 1} (${meta.label}): mídia não selecionada`);
                }
                if (meta.hasPoll) {
                    if (!block.config.title?.trim()) {
                        errors.push(`Bloco #${idx + 1} (Enquete): pergunta vazia`);
                    }
                    const validOpts = (block.config.options || []).filter(o => o?.trim());
                    if (validOpts.length < 2) {
                        errors.push(`Bloco #${idx + 1} (Enquete): mínimo 2 opções`);
                    }
                }
            });

            return { valid: errors.length === 0, errors };
        }

        // ====================================================================
        // EXECUÇÃO: Enviar sequência para um destinatário via Evolution API
        // ====================================================================

        /**
         * Executar a sequência de blocos para um número.
         * @param {string} recipient - Número do destinatário (já com DDI ou não)
         * @param {Object} [variables] - Variáveis de substituição ({{nome}}, {{cupom}}, etc.)
         * @param {Function} [onProgress] - Callback (blockIndex, totalBlocks, status)
         * @returns {Promise<{sent: number, failed: number, errors: Object[]}>}
         */
        async execute(recipient, variables = {}, onProgress = null) {
            const PN = root.PhoneNormalizer || { withDDI: (p) => '55' + String(p).replace(/\D/g,'') };
            const phone = PN.withDDI(recipient);
            
            let sent = 0, failed = 0;
            const errors = [];

            for (let i = 0; i < this.blocks.length; i++) {
                const block = this.blocks[i];
                
                if (onProgress) onProgress(i, this.blocks.length, 'sending');
                
                try {
                    switch (block.type) {
                        case 'delay':
                            await this._sleep((block.config.seconds || 5) * 1000);
                            break;

                        case 'presence':
                            await this._sendPresence(phone, block.config.presenceType || 'composing');
                            await this._sleep((block.config.seconds || 3) * 1000);
                            break;

                        case 'text':
                            await this._sendText(phone, this._applyVariables(block.config.text, variables));
                            sent++;
                            break;

                        case 'image':
                            await this._sendMedia(phone, 'image', block.config.base64 || block.config.url, 
                                this._applyVariables(block.config.caption, variables));
                            sent++;
                            break;

                        case 'video':
                            await this._sendMedia(phone, 'video', block.config.base64 || block.config.url,
                                this._applyVariables(block.config.caption, variables));
                            sent++;
                            break;

                        case 'audio':
                            await this._sendMedia(phone, 'audio', block.config.base64 || block.config.url);
                            sent++;
                            break;

                        case 'sticker':
                            await this._sendMedia(phone, 'sticker', block.config.base64 || block.config.url);
                            sent++;
                            break;

                        case 'poll':
                            await this._sendPoll(phone, block.config.title, 
                                (block.config.options || []).filter(o => o?.trim()), 
                                block.config.selectableCount || 1);
                            sent++;
                            break;
                    }
                    
                    if (onProgress) onProgress(i, this.blocks.length, 'done');
                } catch (err) {
                    failed++;
                    errors.push({ blockIndex: i, type: block.type, error: err.message });
                    if (onProgress) onProgress(i, this.blocks.length, 'error');
                }
            }

            return { sent, failed, errors };
        }

        // ====================================================================
        // EVOLUTION API — Métodos de envio
        // ====================================================================

        async _sendText(phone, text) {
            const res = await fetch(`${this.apiBase}/whatsapp/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message: text })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        }

        async _sendMedia(phone, mediaType, media, caption) {
            const res = await fetch(`${this.apiBase}/whatsapp/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, mediaType, media, caption: caption || '' })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        }

        async _sendPoll(phone, title, options, selectableCount) {
            const res = await fetch(`${this.apiBase}/whatsapp/send-poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, title, options, selectableCount })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        }

        async _sendPresence(phone, presenceType) {
            const res = await fetch(`${this.apiBase}/whatsapp/send-presence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, presence: presenceType })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        }

        // ====================================================================
        // HELPERS
        // ====================================================================

        _applyVariables(text, variables) {
            if (!text) return '';
            return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
                return variables[key] !== undefined ? variables[key] : match;
            });
        }

        _sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        _notifyUpdate() {
            if (this.onUpdate) {
                this.onUpdate(this.blocks);
            }
        }

        /**
         * Estimar tempo total da sequência
         * @param {number} contactCount - Número de contatos
         * @param {number} batchSize - Tamanho do lote
         * @param {number} batchIntervalMin - Intervalo entre lotes em minutos
         * @param {number} msgDelayMax - Delay máximo entre mensagens em segundos
         * @returns {{ totalMinutes: number, batches: number, blocksPerContact: number }}
         */
        estimateTime(contactCount = 1, batchSize = 10, batchIntervalMin = 15, msgDelayMax = 4) {
            const blocksPerContact = this.blocks.length;
            const delayBlocks = this.blocks.filter(b => b.type === 'delay' || b.type === 'presence');
            const internalDelay = delayBlocks.reduce((s, b) => s + (b.config.seconds || 3), 0);
            
            // Tempo per contact: (blocos de envio * delay_entre_msgs) + delays internos
            const sendBlocks = this.blocks.filter(b => b.type !== 'delay' && b.type !== 'presence');
            const perContact = (sendBlocks.length * msgDelayMax) + internalDelay;
            
            const batches = Math.ceil(contactCount / batchSize);
            const totalMinutes = Math.ceil((batches * batchIntervalMin) + (perContact * contactCount / 60));
            
            return { totalMinutes, batches, blocksPerContact };
        }
    }

    // ========================================================================
    // STATIC HELPERS
    // ========================================================================
    MessageSequenceBuilder.BLOCK_TYPES = BLOCK_TYPES;
    
    /**
     * Factory: criar builder com defaults do CRM
     */
    MessageSequenceBuilder.create = function(containerId, onUpdate) {
        return new MessageSequenceBuilder({
            containerId,
            onUpdate,
            apiBase: '/api',
            instanceName: 'Cjota'
        });
    };

    // ========================================================================
    // EXPORT
    // ========================================================================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MessageSequenceBuilder;
    }
    if (typeof root !== 'undefined') {
        root.MessageSequenceBuilder = MessageSequenceBuilder;
    }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
