// Small dependency-free SVG charts.
const PAD = { l: 40, r: 12, t: 12, b: 28 };
const nice = (max) => { if (max <= 5) return 5; const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; };

export function Legend({ items }) {
  return <div className="flex flex-wrap gap-4 text-xs text-slate-600">{items.map((i) => <span key={i.name} className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : `2px solid ${i.color}`, height: 0 }} />{i.name}</span>)}</div>;
}

// series: [{ name, color, dashed?, values: [number|null] }], labels: string[]
export function LineChart({ labels, series, height = 220, unit = '' }) {
  const W = 720, H = height;
  const max = nice(Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null))));
  const x = (i) => PAD.l + (labels.length <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (labels.length - 1));
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f * 10) / 10);
  const every = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {ticks.map((t) => (
          <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#E6E3DD" /><text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8C867B">{t}{unit}</text></g>
        ))}
        {labels.map((l, i) => (i % every === 0 ? <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8C867B">{l.slice(5)}</text> : null))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
          const segs = []; let cur = [];
          pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
          if (cur.length) segs.push(cur);
          return (
            <g key={s.name}>
              {segs.map((seg, k) => <polyline key={k} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} points={seg.map((p) => p.join(',')).join(' ')} />)}
              {!s.dashed && labels.length <= 31 && pts.map((p, i) => (p ? <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={s.color}><title>{`${s.name} ${labels[i]}: ${s.values[i]}`}</title></circle> : null))}
            </g>
          );
        })}
      </svg>
      <Legend items={series} />
    </div>
  );
}

// groups: [{ label, bars: [{ name, color, value }] }]
export function BarChart({ groups, height = 220 }) {
  const W = 720, H = height;
  const max = nice(Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value))));
  const gw = (W - PAD.l - PAD.r) / Math.max(1, groups.length);
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const legend = groups[0]?.bars.map((b) => ({ name: b.name, color: b.color })) || [];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="#E6E3DD" /><text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="#8C867B">{max * f}</text></g>)}
        {groups.map((g, i) => {
          const bw = Math.min(28, (gw * 0.7) / g.bars.length);
          return (
            <g key={g.label + i}>
              {g.bars.map((b, k) => <rect key={b.name} x={PAD.l + i * gw + gw / 2 - (bw * g.bars.length) / 2 + k * bw} y={y(b.value)} width={bw - 2} height={H - PAD.b - y(b.value)} fill={b.color} rx="2"><title>{`${g.label} · ${b.name}: ${b.value}`}</title></rect>)}
              <text x={PAD.l + i * gw + gw / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="#6B665E">{g.label.length > 14 ? `${g.label.slice(0, 13)}…` : g.label}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={legend} />
    </div>
  );
}

export function Bar({ value, max, color = 'bg-brand-500', className = '' }) {
  return <div className={`h-2 overflow-hidden rounded-full bg-slate-100 ${className}`}><div className={`h-full ${color}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>;
}
