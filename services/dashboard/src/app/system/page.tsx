'use client';

import { useEffect, useState } from 'react';
import { fetchSystemStatus, fetchSystemSettings, updateSystemSettings } from '@/lib/api';
import type { SystemSettings } from '@/lib/api';
import { RuntimeConfigSection } from '@/components/runtime-config-section';

function StatusDot({ status }: { status: string }) {
  const ok = status === 'ok';
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#22c55e' : '#ef4444', marginRight: 8,
    }} />
  );
}

function CircuitBadge({ state }: { state: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    closed: { bg: '#dcfce7', text: '#166534' },
    open: { bg: '#fee2e2', text: '#991b1b' },
    'half-open': { bg: '#fef9c3', text: '#854d0e' },
  };
  const style = colors[state] ?? colors.closed;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
      fontSize: 12, fontWeight: 600, background: style.bg, color: style.text,
    }}>
      {state}
    </span>
  );
}

function timeAgo(date: string | null): string {
  if (!date) return 'nunca';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace menos de 1 min';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

function MiniSparkline({ hourlyBreakdown }: { hourlyBreakdown: Array<{ hour: string; success: number; failure: number }> }) {
  if (!hourlyBreakdown || hourlyBreakdown.length === 0) {
    return <span style={{ fontSize: 11, color: '#9ca3af' }}>sin datos</span>;
  }
  const last8 = hourlyBreakdown.slice(0, 8).reverse();
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
      {last8.map((h, i) => {
        const total = h.success + h.failure;
        const color = h.failure > 0 ? '#ef4444' : '#22c55e';
        const height = total > 0 ? Math.max(4, Math.round((h.success / total) * 20)) : 4;
        return (
          <div
            key={i}
            title={`${h.hour}: ${h.success}✓ ${h.failure}✗`}
            style={{ width: 6, height, background: color, borderRadius: 1, flexShrink: 0 }}
          />
        );
      })}
    </div>
  );
}

function SourceCard({ source }: { source: any }) {
  const m = source.metrics24h ?? {};
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{source.name}</span>
          {!source.enabled && (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>
              desactivado
            </span>
          )}
          {source.hasApiKey && (
            <span style={{ marginLeft: 6, fontSize: 11, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>
              API key
            </span>
          )}
        </div>
        <CircuitBadge state={source.circuitState ?? 'closed'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 13, marginBottom: 12 }}>
        <div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Tasa de éxito (24h)</div>
          <div style={{ fontWeight: 600 }}>{m.totalRuns > 0 ? `${Math.round((m.successRate ?? 0) * 100)}%` : 'sin datos'}</div>
        </div>
        <div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Latencia media</div>
          <div style={{ fontWeight: 600 }}>{m.totalRuns > 0 ? `${m.avgLatencyMs ?? 0}ms` : '—'}</div>
        </div>
        <div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Resultados medios</div>
          <div style={{ fontWeight: 600 }}>{m.totalRuns > 0 ? (m.avgResultCount ?? 0) : '—'}</div>
        </div>
        <div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Último éxito</div>
          <div style={{ fontWeight: 600 }}>{timeAgo(source.lastSuccessAt)}</div>
        </div>
        <div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Ejecuciones (24h)</div>
          <div style={{ fontWeight: 600 }}>{m.totalRuns ?? 0}</div>
        </div>
        <div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Historial</div>
          <MiniSparkline hourlyBreakdown={m.hourlyBreakdown ?? []} />
        </div>
      </div>
    </div>
  );
}

export default function SystemPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [emailsPaused, setEmailsPaused] = useState(false);
  const [togglingEmails, setTogglingEmails] = useState(false);

  // Webhook settings
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null);

  // Slack settings
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [savingSlack, setSavingSlack] = useState(false);

  // Discord settings
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [savingDiscord, setSavingDiscord] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([fetchSystemStatus(), fetchSystemSettings()])
      .then(([s, settings]) => {
        setStatus(s);
        setEmailsPaused(s.emailsPaused ?? false);
        setWebhookUrl(settings.webhookUrl ?? '');
        setWebhookEnabled(settings.webhookEnabled ?? false);
        setSlackWebhookUrl(settings.slackWebhookUrl ?? '');
        setDiscordWebhookUrl(settings.discordWebhookUrl ?? '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleToggleEmails() {
    setTogglingEmails(true);
    try {
      const newVal = !emailsPaused;
      await updateSystemSettings({ emailsPaused: newVal });
      setEmailsPaused(newVal);
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingEmails(false);
    }
  }

  async function handleSaveWebhook() {
    setSavingWebhook(true);
    setWebhookTestResult(null);
    try {
      await updateSystemSettings({ webhookUrl: webhookUrl || null, webhookEnabled });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleTestWebhook() {
    if (!webhookUrl) return;
    setWebhookTestResult(null);
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, source: 'flight-hunter', timestamp: new Date().toISOString() }),
      });
      setWebhookTestResult(res.ok ? 'OK (' + res.status + ')' : 'Error: ' + res.status);
    } catch (e) {
      setWebhookTestResult('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleSaveSlack() {
    setSavingSlack(true);
    try {
      await updateSystemSettings({ slackWebhookUrl: slackWebhookUrl || null });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSlack(false);
    }
  }

  async function handleSaveDiscord() {
    setSavingDiscord(true);
    try {
      await updateSystemSettings({ discordWebhookUrl: discordWebhookUrl || null });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingDiscord(false);
    }
  }

  if (loading) return <div>Cargando...</div>;
  if (!status) return <div>Error al cargar estado del sistema</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Estado del Sistema</h1>
        <button onClick={load} style={{
          padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6,
          fontSize: 14, cursor: 'pointer', background: '#fff',
        }}>
          Actualizar
        </button>
      </div>

      {/* Email pause toggle */}
      <div style={{
        background: emailsPaused ? '#fef3c7' : '#fff', border: `1px solid ${emailsPaused ? '#fcd34d' : '#e5e7eb'}`,
        borderRadius: 8, padding: '14px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {emailsPaused ? 'Emails pausados' : 'Emails activos'}
          </span>
          <span style={{ marginLeft: 12, color: '#6b7280', fontSize: 13 }}>
            {emailsPaused ? 'Los emails de alerta no se envian hasta que se reanuden.' : 'Los emails de alerta se envian normalmente.'}
          </span>
        </div>
        <button
          onClick={handleToggleEmails}
          disabled={togglingEmails}
          style={{
            padding: '7px 18px', borderRadius: 6, fontSize: 14, cursor: 'pointer',
            border: 'none',
            background: emailsPaused ? '#22c55e' : '#ef4444',
            color: '#fff', fontWeight: 600,
            opacity: togglingEmails ? 0.7 : 1,
          }}
        >
          {emailsPaused ? 'Reanudar emails' : 'Pausar emails'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Base de Datos</h2>
          <div style={{ fontSize: 14 }}>
            <StatusDot status={status.postgres} />
            PostgreSQL: <strong>{status.postgres}</strong>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Cache / Colas</h2>
          <div style={{ fontSize: 14 }}>
            <StatusDot status={status.redis} />
            Redis: <strong>{status.redis}</strong>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15 }}>Colas de Trabajo</h2>
        {typeof status.queues === 'object' && !status.queues.error ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Cola', 'En espera', 'Activos', 'Completados', 'Fallidos'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(status.queues).map(([name, counts]: [string, any]) => (
                <tr key={name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{name}</td>
                  <td style={{ padding: '8px 12px' }}>{counts.waiting ?? 0}</td>
                  <td style={{ padding: '8px 12px' }}>{counts.active ?? 0}</td>
                  <td style={{ padding: '8px 12px' }}>{counts.completed ?? 0}</td>
                  <td style={{ padding: '8px 12px', color: counts.failed > 0 ? '#dc2626' : undefined }}>{counts.failed ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#ef4444' }}>{status.queues?.error ?? 'No se pudo conectar a las colas'}</div>
        )}
      </div>

      {/* Webhook section */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 20px', marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Webhook genérico</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={webhookEnabled} onChange={e => setWebhookEnabled(e.target.checked)} />
            Habilitado
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, width: '100%', maxWidth: 480 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSaveWebhook} disabled={savingWebhook} style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600,
              opacity: savingWebhook ? 0.7 : 1,
            }}>
              {savingWebhook ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={handleTestWebhook} disabled={!webhookUrl} style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: '1px solid #d1d5db', background: '#fff', color: '#374151',
              opacity: !webhookUrl ? 0.5 : 1,
            }}>
              Probar
            </button>
            {webhookTestResult && (
              <span style={{ fontSize: 13, alignSelf: 'center', color: webhookTestResult.startsWith('OK') ? '#22c55e' : '#ef4444' }}>
                {webhookTestResult}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Slack section */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 20px', marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Slack</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="url"
            value={slackWebhookUrl}
            onChange={e => setSlackWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, width: '100%', maxWidth: 480 }}
          />
          <button onClick={handleSaveSlack} disabled={savingSlack} style={{
            width: 'fit-content', padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600,
            opacity: savingSlack ? 0.7 : 1,
          }}>
            {savingSlack ? 'Guardando...' : 'Guardar'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>URL del incoming webhook de Slack. Se activa con alertas urgentes.</span>
        </div>
      </div>

      {/* Discord section */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 20px', marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Discord</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="url"
            value={discordWebhookUrl}
            onChange={e => setDiscordWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, width: '100%', maxWidth: 480 }}
          />
          <button onClick={handleSaveDiscord} disabled={savingDiscord} style={{
            width: 'fit-content', padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            border: 'none', background: '#5865f2', color: '#fff', fontWeight: 600,
            opacity: savingDiscord ? 0.7 : 1,
          }}>
            {savingDiscord ? 'Guardando...' : 'Guardar'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>URL del webhook de Discord. Se activa con alertas urgentes.</span>
        </div>
      </div>

      {/* Sources cards */}
      {Array.isArray(status.sources) && status.sources.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>Fuentes de datos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {status.sources.map((src: any) => (
              <SourceCard key={src.name} source={src} />
            ))}
          </div>
        </div>
      )}

      {/* Runtime config: editable baggage policies, AR taxes, tunables */}
      <RuntimeConfigSection />
    </div>
  );
}
