'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  MessageCircle,
  Sparkles,
  Users,
  Megaphone,
  Ticket,
  Package,
  Receipt,
  Zap,
  RefreshCw,
  Settings,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react';
import { useUIStore } from '@/store';
import { useEffect, useState } from 'react';

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  className?: string;
}

function NavItem({ href, icon, label, badge, className }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={`nav-item ${isActive ? 'active' : ''} ${className || ''}`}
    >
      {icon}
      <span className={className?.includes('font-semibold') ? 'font-semibold' : ''}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar() {
  const { isCRMSidebarOpen } = useUIStore();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('crm-dark-mode');
    if (saved === 'true') {
      document.documentElement.classList.add('dark');
      setDarkMode(true);
    }
  }, []);

  function toggleDarkMode() {
    const html = document.documentElement;
    html.classList.toggle('dark');
    const isDark = html.classList.contains('dark');
    localStorage.setItem('crm-dark-mode', String(isDark));
    setDarkMode(isDark);
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/login';
  }

  return (
    <aside
      className={`w-64 bg-white dark:bg-slate-800 border-r border-slate-100 dark:border-slate-700 flex flex-col transition-transform duration-200 ${
        isCRMSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}
    >
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-700">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">CRM</h1>
        <p className="text-xs text-slate-400 mt-0.5">Sistema de Gestão</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavItem
          href="/"
          icon={<LayoutDashboard className="w-5 h-5" />}
          label="Dashboard"
        />
        <NavItem
          href="/atendimento"
          icon={<MessageCircle className="w-5 h-5" />}
          label="Atendimento"
          className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 font-semibold"
        />
        <NavItem
          href="/analytics"
          icon={<Sparkles className="w-5 h-5" />}
          label="Anny BI"
          className="bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 font-semibold"
        />
        <NavItem
          href="/clientes"
          icon={<Users className="w-5 h-5" />}
          label="Clientes"
        />
        <NavItem
          href="/campanhas"
          icon={<Megaphone className="w-5 h-5" />}
          label="Campanhas"
        />
        <NavItem
          href="/cupons"
          icon={<Ticket className="w-5 h-5" />}
          label="Gestão de Cupons"
        />

        {/* Seção: Dados */}
        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
          <p className="px-3 mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
            Dados
          </p>
          <NavItem
            href="/produtos"
            icon={<Package className="w-5 h-5" />}
            label="Produtos"
          />
          <NavItem
            href="/pedidos"
            icon={<Receipt className="w-5 h-5" />}
            label="Pedidos"
          />
          <NavItem
            href="/webhooks"
            icon={<Zap className="w-5 h-5" />}
            label="Webhooks"
          />
        </div>

        {/* Seção: Sistema */}
        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
          <p className="px-3 mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
            Sistema
          </p>
          <button
            onClick={() => {/* TODO: sync */}}
            className="nav-item w-full text-left"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Sincronizar</span>
          </button>
          <NavItem
            href="/configuracoes"
            icon={<Settings className="w-5 h-5" />}
            label="Configurações"
          />

          {/* Dark Mode Toggle */}
          <div className="nav-item justify-between cursor-default">
            <div className="flex items-center gap-3">
              {darkMode ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
              <span>Modo Escuro</span>
            </div>
            <button
              className="dark-mode-toggle"
              onClick={toggleDarkMode}
              title="Alternar modo escuro"
            />
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="nav-item text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 mt-2 w-full text-left"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair do CRM</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
