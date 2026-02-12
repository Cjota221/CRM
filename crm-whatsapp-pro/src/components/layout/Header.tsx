'use client';

import { Menu, Bell } from 'lucide-react';
import { useUIStore } from '@/store';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { toggleCRMSidebar } = useUIStore();

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-8 py-5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleCRMSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 relative">
            <Bell className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
