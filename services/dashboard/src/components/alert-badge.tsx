interface AlertBadgeProps { level: string; }

const COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: '#fef2f2', text: '#dc2626' },
  good: { bg: '#f0fdf4', text: '#16a34a' },
  info: { bg: '#eff6ff', text: '#2563eb' },
};

export function AlertBadge({ level }: AlertBadgeProps) {
  const style = COLORS[level] ?? COLORS.info;
  return (
    <span style={{ background: style.bg, color: style.text, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      {level.toUpperCase()}
    </span>
  );
}
