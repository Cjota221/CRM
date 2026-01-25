// ============================================================================
// PAINEL ANNE - Widget de Inteligência (Raio-X do Cliente)
// ============================================================================
// Painel lateral direito que mostra contexto completo do cliente

class AnnePanel {
    constructor() {
        this.currentPhone = null;
        this.profile = null;
        this.isLoading = false;
    }
    
    /**
     * Carregar e exibir perfil do cliente
     */
    async loadProfile(phone) {
        if (!phone) {
            this.clear();
            return;
        }
        
        // Se já está carregando o mesmo, não fazer nada
        if (this.isLoading && this.currentPhone === phone) {
            return;
        }
        
        this.currentPhone = phone;
        this.isLoading = true;
        this.showSkeleton();
        
        try {
            const response = await fetch('/api/client-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            
            if (!response.ok) {
                this.showError('Erro ao carregar perfil');
                return;
            }
            
            this.profile = await response.json();
            this.render();
            
        } catch (error) {
            console.error('[Anne] Erro:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * Renderizar painel completo
     */
    render() {
        if (!this.profile) {
            this.clear();
            return;
        }
        
        const container = document.getElementById('annePanel') || this.createContainer();
        const p = this.profile;
        
        container.innerHTML = `
            <!-- Cabeçalho -->
            <div class="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4">
                <div class="flex items-center gap-2 mb-3">
                    <span class="text-2xl">✨</span>
                    <h2 class="text-lg font-bold">Anne AI</h2>
                </div>
                <div class="text-sm opacity-90">${p.client?.name || 'Cliente'}</div>
            </div>
            
            <!-- Insight Principal -->
            <div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-900">
                <div class="font-semibold">${p.insight}</div>
            </div>
            
            <!-- Métricas -->
            <div class="p-4 grid grid-cols-2 gap-3">
                <div class="bg-gray-50 p-3 rounded text-center">
                    <div class="text-2xl font-bold text-green-600">R$ ${(p.metrics?.total_spent || 0).toFixed(2)}</div>
                    <div class="text-xs text-gray-600 mt-1">Total Gasto</div>
                </div>
                <div class="bg-gray-50 p-3 rounded text-center">
                    <div class="text-2xl font-bold text-blue-600">${p.metrics?.orders_count || 0}</div>
                    <div class="text-xs text-gray-600 mt-1">Pedidos</div>
                </div>
                <div class="bg-gray-50 p-3 rounded text-center">
                    <div class="text-2xl font-bold text-purple-600">R$ ${(p.metrics?.avg_ticket || 0).toFixed(2)}</div>
                    <div class="text-xs text-gray-600 mt-1">Ticket Médio</div>
                </div>
                <div class="bg-gray-50 p-3 rounded text-center">
                    <div class="text-2xl font-bold text-orange-600">${p.metrics?.days_since_last_purchase || '?'}</div>
                    <div class="text-xs text-gray-600 mt-1">Dias s/ compra</div>
                </div>
            </div>
            
            <!-- Recomendação -->
            <div class="p-4 bg-yellow-50 border-l-4 border-yellow-500">
                <div class="text-sm font-semibold text-yellow-900 mb-2">💡 Recomendação:</div>
                <div class="text-sm text-yellow-800">${p.recommendation}</div>
            </div>
            
            <!-- Últimos Produtos -->
            <div class="p-4">
                <div class="font-semibold text-gray-900 mb-3">📦 Últimas Compras</div>
                <div class="space-y-2">
                    ${(p.last_products || []).map(prod => `
                        <div class="bg-white p-2 rounded border border-gray-200">
                            <div class="flex justify-between items-start">
                                <div>
                                    <div class="font-medium text-gray-900">${prod.name}</div>
                                    <div class="text-xs text-gray-600">${prod.date}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-semibold text-gray-900">R$ ${prod.value?.toFixed(2)}</div>
                                    <div class="text-xs text-gray-600">x${prod.qty}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Actions -->
            <div class="p-4 border-t flex gap-2">
                <button onclick="annePanel.offerProduct()" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded font-medium text-sm transition">
                    💚 Oferecer Produto
                </button>
                <button onclick="annePanel.viewHistory()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium text-sm transition">
                    📊 Ver Histórico
                </button>
            </div>
        `;
    }
    
    /**
     * Skeleton loading
     */
    showSkeleton() {
        const container = document.getElementById('annePanel') || this.createContainer();
        container.innerHTML = `
            <div class="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 animate-pulse">
                <div class="h-6 bg-white/30 rounded w-32 mb-3"></div>
                <div class="h-4 bg-white/30 rounded w-24"></div>
            </div>
            <div class="p-4 space-y-3">
                ${Array(5).fill(0).map(() => '<div class="h-12 bg-gray-200 rounded animate-pulse"></div>').join('')}
            </div>
        `;
    }
    
    /**
     * Mostrar erro
     */
    showError(message) {
        const container = document.getElementById('annePanel') || this.createContainer();
        container.innerHTML = `
            <div class="p-4 bg-red-50 text-red-700 rounded-lg m-3">
                <strong>⚠️ Anne offline</strong>
                <p class="text-sm mt-1">${message}</p>
            </div>
        `;
    }
    
    /**
     * Limpar painel
     */
    clear() {
        const container = document.getElementById('annePanel');
        if (container) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <div class="text-3xl mb-3">👁️</div>
                    <p>Selecione um chat</p>
                    <p class="text-xs mt-2">Anne analisará o cliente</p>
                </div>
            `;
        }
    }
    
    /**
     * Oferecer produto (ação)
     */
    offerProduct() {
        console.log('[Anne] Oferecendo produto para:', this.currentPhone);
        alert(`Ofereça o produto recomendado para ${this.profile?.client?.name}!`);
    }
    
    /**
     * Ver histórico completo
     */
    viewHistory() {
        console.log('[Anne] Abrindo histórico para:', this.currentPhone);
        alert(`Histórico completo de ${this.profile?.client?.name}`);
    }
    
    /**
     * Criar container se não existir
     */
    createContainer() {
        const sidebar = document.getElementById('crmDataContainer');
        if (!sidebar) {
            console.warn('[Anne] Container #annePanel não encontrado');
            return null;
        }
        
        const container = document.createElement('div');
        container.id = 'annePanel';
        container.className = 'bg-white rounded-lg shadow-lg overflow-hidden flex flex-col h-full';
        
        // Limpar sidebar e adicionar container
        sidebar.innerHTML = '';
        sidebar.appendChild(container);
        
        return container;
    }
}

// Instância global
const annePanel = new AnnePanel();

// Exportar
window.annePanel = annePanel;

// ============================================================================
// EVENT LISTENER: Ao selecionar chat, carregar perfil na Anne
// ============================================================================

window.addEventListener('chatSelected', async (event) => {
    const { chat } = event.detail;
    
    if (!chat.isGroup && chat.cleanPhone) {
        await annePanel.loadProfile(chat.cleanPhone);
    } else {
        annePanel.clear();
    }
});
