-- ============================================================================
-- SUPABASE RPC: Get Client Complete Profile
-- ============================================================================
-- Esta função retorna o perfil completo de um cliente baseado no telefone
-- Inclui: dados cadastrais, métricas de compra, histórico de produtos

create or replace function get_client_profile(phone_input text)
returns json as $$
declare
  client_data json;
  order_stats json;
  last_items json;
begin
  -- 1. Buscar dados cadastrais do cliente por telefone
  select json_build_object(
    'id', id,
    'name', name,
    'phone', phone,
    'email', email,
    'status', status,
    'created_at', created_at,
    'avatar_url', avatar_url
  ) into client_data
  from clients
  where phone = phone_input
  limit 1;

  -- Se não existe cliente, retorna null
  if client_data is null then
    return json_build_object(
      'cliente', null,
      'metrics', null,
      'historico_produtos', null,
      'error', 'Cliente não encontrado'
    );
  end if;

  -- 2. Calcular métricas de compra (Lifetime Value, Ticket Médio, etc)
  select json_build_object(
    'total_gasto', coalesce(sum(total_amount), 0),
    'ticket_medio', coalesce(avg(total_amount), 0),
    'qtd_pedidos', count(*),
    'primeira_compra', min(created_at),
    'ultima_compra', max(created_at)
  ) into order_stats
  from orders
  where client_id = (client_data->>'id')::uuid;

  -- 3. Pegar últimos produtos comprados (com agregação de quantidade)
  select json_agg(
    json_build_object(
      'produto', product_name,
      'quantidade', sum(quantity),
      'preco_total', sum(price * quantity),
      'primeira_compra', min(oi.created_at),
      'ultima_compra', max(oi.created_at)
    )
    order by max(oi.created_at) desc
  ) into last_items
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.client_id = (client_data->>'id')::uuid
  group by oi.product_name
  limit 10;

  -- 4. Montar e retornar o JSON final com tudo
  return json_build_object(
    'cliente', client_data,
    'metrics', order_stats,
    'historico_produtos', coalesce(last_items, '[]'::json),
    'error', null
  );

end;
$$ language plpgsql;

-- ============================================================================
-- RPC: Get Client by Phone (versão simplificada para busca rápida)
-- ============================================================================

create or replace function get_client_by_phone(phone_input text)
returns table (
  id uuid,
  name text,
  phone text,
  email text,
  status text,
  created_at timestamp,
  avatar_url text
) as $$
begin
  return query
  select 
    clients.id,
    clients.name,
    clients.phone,
    clients.email,
    clients.status,
    clients.created_at,
    clients.avatar_url
  from clients
  where clients.phone = phone_input
  limit 1;
end;
$$ language plpgsql;

-- ============================================================================
-- RPC: Sync Chat with Client (usado para sincronizar nome quando edita no CRM)
-- ============================================================================

create or replace function sync_chat_with_client(phone_input text, new_name text)
returns json as $$
declare
  client_id uuid;
  updated_count int;
begin
  -- 1. Buscar ID do cliente
  select id into client_id from clients where phone = phone_input limit 1;
  
  if client_id is null then
    return json_build_object('error', 'Cliente não encontrado', 'success', false);
  end if;

  -- 2. Atualizar nome no cliente
  update clients 
  set name = new_name, updated_at = now()
  where id = client_id;

  -- 3. Se precisar sincronizar em outra tabela (chats, contacts, etc)
  -- UPDATE chats SET pushName = new_name WHERE remoteJid LIKE phone_input || '%'
  -- Descomentar conforme necessário

  return json_build_object(
    'success', true,
    'message', 'Cliente atualizado com sucesso',
    'client_id', client_id,
    'new_name', new_name
  );

end;
$$ language plpgsql;

-- ============================================================================
-- Garantir que a tabela `clients` tem as colunas necessárias
-- ============================================================================

-- Se a tabela já existe, isso fará nothing (idempotente)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url text;

-- ============================================================================
-- ÍNDICES para performance
-- ============================================================================

-- Índice para busca rápida por telefone
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- Índice para busca de pedidos por cliente
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);

-- Índice composto para performance em relatórios
CREATE INDEX IF NOT EXISTS idx_orders_client_created ON orders(client_id, created_at DESC);
