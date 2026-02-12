/**
 * Layout de Autenticação — Fullscreen sem sidebar
 * Visual replicado do login.html atual
 */

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1f33] via-[#1e3a5f] to-[#162d4d] relative overflow-hidden">
      {/* Círculos animados de fundo (replicando login.html) */}
      <div className="absolute w-[400px] h-[400px] rounded-full bg-[#25d366] opacity-[0.07] -top-[100px] -right-[100px] animate-[float_8s_ease-in-out_infinite]" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-[#25d366] opacity-[0.07] -bottom-[80px] -left-[80px] animate-[float_8s_ease-in-out_infinite_4s]" />
      {children}
    </div>
  );
}
