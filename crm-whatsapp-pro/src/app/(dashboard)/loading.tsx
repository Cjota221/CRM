export default function DashboardLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-crm-primary rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    </div>
  );
}
