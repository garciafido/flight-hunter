interface ScoreBarProps { score: number; }

export function ScoreBar({ score }: ScoreBarProps) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  return (
    <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, width: '100%' }}>
      <div style={{ background: color, borderRadius: 4, height: 8, width: `${Math.min(100, Math.max(0, score))}%` }} />
    </div>
  );
}
