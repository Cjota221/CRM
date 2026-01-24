-- ============================================================================
-- SCRIPT DE CRIAÇÃO DAS TABELAS DO CRM NO SUPABASE
-- Execute este script no SQL Editor do Supabase Dashboard
-- ============================================================================

-- Tabela de Clientes
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    birthday DATE,
    cpf TEXT,
    address TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    origin TEXT,
    last_purchase_date DATE,
    total_spent DECIMAL(10,2) DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    products JSONB DEFAULT '[]'::jsonb,
    order_ids TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Produtos
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    codigo TEXT,
    name TEXT NOT NULL,
    description TEXT,
    sku TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    stock INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    manages_stock BOOLEAN DEFAULT FALSE,
    image TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    barcode TEXT,
    variacoes JSONB DEFAULT '[]'::jsonb,
    has_variacoes BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    codigo TEXT,
    data TIMESTAMP WITH TIME ZONE,
    client_id TEXT REFERENCES clients(id),
    client_name TEXT,
    client_phone TEXT,
    total DECIMAL(10,2) DEFAULT 0,
    status TEXT,
    products JSONB DEFAULT '[]'::jsonb,
    origin TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Cupons
CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    discount DECIMAL(5,2) NOT NULL,
    type TEXT DEFAULT 'percent', -- 'percent' ou 'fixed'
    min_value DECIMAL(10,2) DEFAULT 0,
    max_uses INTEGER DEFAULT 0, -- 0 = ilimitado
    current_uses INTEGER DEFAULT 0,
    valid_until DATE,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    assigned_clients JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Campanhas
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT, -- 'inactive', 'vip', 'birthday', etc
    status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'sent', 'completed'
    message TEXT,
    filter_criteria JSONB,
    target_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    scheduled_date TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    coupon_id TEXT REFERENCES coupons(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Configurações
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'main',
    active_days INTEGER DEFAULT 30,
    risk_days INTEGER DEFAULT 60,
    groq_api_key TEXT,
    whatsapp_instance TEXT,
    auto_sync BOOLEAN DEFAULT FALSE,
    last_sync TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Carrinhos Abandonados (Webhooks do FacilZap)
CREATE TABLE IF NOT EXISTS abandoned_carts (
    id TEXT PRIMARY KEY,
    cliente_id TEXT,
    cliente_nome TEXT,
    cliente_whatsapp TEXT,
    cliente_email TEXT,
    valor_total DECIMAL(10,2) DEFAULT 0,
    quantidade_produtos INTEGER DEFAULT 0,
    produtos JSONB DEFAULT '[]'::jsonb,
    link_carrinho TEXT, -- Link direto para o carrinho no FacilZap
    iniciado_em TIMESTAMP WITH TIME ZONE,
    ultima_atualizacao TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pendente', -- 'pendente', 'recuperado', 'expirado'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Eventos de Webhook (histórico)
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    evento TEXT NOT NULL,
    dados JSONB DEFAULT '{}'::jsonb,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Tags de IA (feedback loop)
CREATE TABLE IF NOT EXISTS ai_tags (
    client_id TEXT PRIMARY KEY REFERENCES clients(id),
    tags JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_last_purchase ON clients(last_purchase_date);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_data ON orders(data);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- ============================================================================
-- RLS (Row Level Security) - Opcional, mas recomendado para produção
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tags ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir acesso via service_role (backend)
-- O service_role ignora RLS por padrão, então isso já funciona

-- ============================================================================
-- TRIGGER PARA ATUALIZAR updated_at AUTOMATICAMENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INSERIR CONFIGURAÇÕES PADRÃO
-- ============================================================================

INSERT INTO settings (id, active_days, risk_days) 
VALUES ('main', 30, 60) 
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- CONCLUÍDO!
-- ============================================================================

SELECT 'Tabelas criadas com sucesso!' as status;
