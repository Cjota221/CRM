/**
 * Utilitários de classes CSS
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatar telefone para exibição
 */
export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  
  if (clean.length === 13) {
    // 5511999999999 -> +55 (11) 99999-9999
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 12) {
    // 551199999999 -> +55 (11) 9999-9999
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  }
  if (clean.length === 11) {
    // 11999999999 -> (11) 99999-9999
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    // 1199999999 -> (11) 9999-9999
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  
  return phone;
}

/**
 * Formatar timestamp para hora
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formatar timestamp para data relativa
 */
export function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return formatTime(timestamp);
  } else if (days === 1) {
    return 'Ontem';
  } else if (days < 7) {
    return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
}

/**
 * Extrair iniciais do nome
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Gerar cor baseada em string (para avatares)
 */
export function stringToColor(str: string): string {
  const colors = [
    '#00a884', '#53bdeb', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Formatar texto WhatsApp (negrito, itálico, etc)
 */
export function formatWhatsAppText(text: string): string {
  if (!text) return '';
  
  let formatted = text
    // Escapar HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Negrito *texto*
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    // Itálico _texto_
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    // Tachado ~texto~
    .replace(/~([^~]+)~/g, '<del>$1</del>')
    // Monoespaçado ```texto```
    .replace(/```([^`]+)```/g, '<code>$1</code>')
    // Quebras de linha
    .replace(/\n/g, '<br>')
    // Links
    .replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" class="text-wa-accent-blue underline">$1</a>'
    );
  
  return formatted;
}

/**
 * Truncar texto
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
