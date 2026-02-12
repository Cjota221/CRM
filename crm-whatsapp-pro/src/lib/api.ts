/**
 * Utilitário centralizado para chamadas API no client-side
 * Todas as chamadas passam pelas API routes do Next.js (/api/*)
 * que fazem proxy para o CRM backend com cookies
 */

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: any;
  params?: Record<string, string>;
}

/**
 * Wrapper de fetch com tratamento de erros padronizado
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { body, params, ...fetchOptions } = options;

  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const config: RequestInit = {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
    },
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  const res = await fetch(url, config);

  // Handle 401 — redirect to login
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError('Não autenticado', 401);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      data?.error || data?.message || `Erro ${res.status}`,
      res.status,
      data
    );
  }

  return data as T;
}

// ============================================================================
// API Functions - usadas pelos React Query hooks
// ============================================================================

// --- Dashboard ---
export const dashboardApi = {
  getMetrics: () => apiFetch('/dashboard'),
};

// --- Clientes ---
export const clientesApi = {
  list: (params?: Record<string, string>) =>
    apiFetch('/clientes', { params }).then((d) =>
      Array.isArray(d) ? d : d.clientes || d.data || []
    ),

  getById: (id: string) => apiFetch(`/clientes?id=${id}`),

  create: (data: any) =>
    apiFetch('/clientes', { method: 'POST', body: data }),

  update: (data: any) =>
    apiFetch('/clientes', { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiFetch(`/clientes?id=${id}`, { method: 'DELETE' }),
};

// --- Campanhas ---
export const campanhasApi = {
  list: () =>
    apiFetch('/campanhas').then((d) =>
      Array.isArray(d) ? d : d.campanhas || d.data || []
    ),

  create: (data: any) =>
    apiFetch('/campanhas', { method: 'POST', body: data }),

  update: (data: any) =>
    apiFetch('/campanhas', { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiFetch(`/campanhas?id=${id}`, { method: 'DELETE' }),
};

// --- Pedidos ---
export const pedidosApi = {
  list: (params?: Record<string, string>) =>
    apiFetch('/pedidos', { params }).then((d) =>
      Array.isArray(d) ? d : d.pedidos || d.data || []
    ),
};

// --- Produtos ---
export const produtosApi = {
  list: (params?: Record<string, string>) =>
    apiFetch('/produtos', { params }).then((d) =>
      Array.isArray(d) ? d : d.produtos || d.data || []
    ),
};

// --- Cupons ---
export const cuponsApi = {
  list: () =>
    apiFetch('/cupons').then((d) =>
      Array.isArray(d) ? d : d.cupons || d.data || []
    ),
};
