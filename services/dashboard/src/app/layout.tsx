import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Flight Hunter Dashboard',
  description: 'Monitor flight deals',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh' }}>
        <nav style={{
          width: 220, background: '#1e293b', color: '#fff', display: 'flex',
          flexDirection: 'column', padding: '24px 0', flexShrink: 0,
        }}>
          <div style={{ padding: '0 20px 24px', fontSize: 18, fontWeight: 700, borderBottom: '1px solid #334155' }}>
            ✈ Flight Hunter
          </div>
          <div style={{ padding: '16px 0' }}>
            {[
              { href: '/', label: 'Dashboard' },
              { href: '/searches', label: 'Búsquedas' },
              { href: '/alerts', label: 'Alertas' },
              { href: '/system', label: 'Sistema' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} style={{
                display: 'block', padding: '10px 20px', color: '#cbd5e1',
                textDecoration: 'none', fontSize: 14,
              }}>
                {label}
              </Link>
            ))}
          </div>
        </nav>
        <main style={{ flex: 1, padding: 32, background: '#f8fafc', overflowY: 'auto' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
