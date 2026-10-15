import { useEffect, useRef, useState } from 'react';
import { progress } from '../lib/progress.js';

// Thin accent line at the top of the window. Appears only if requests take longer than ~200ms (no flicker),
// trickles towards 90%, then completes and fades.
export default function TopProgress() {
  const [state, setState] = useState({ show: false, width: 0 });
  const t = useRef({});
  useEffect(() => progress.subscribe((n) => {
    const x = t.current;
    if (n > 0) {
      clearTimeout(x.hide);
      if (x.delay || x.tick) return;
      x.delay = setTimeout(() => {
        x.delay = null;
        setState({ show: true, width: 12 });
        x.tick = setInterval(() => setState((s) => ({ show: true, width: s.width + (90 - s.width) * 0.12 })), 220);
      }, 200);
    } else {
      clearTimeout(x.delay); x.delay = null;
      if (x.tick) {
        clearInterval(x.tick); x.tick = null;
        setState({ show: true, width: 100 });
        x.hide = setTimeout(() => setState({ show: false, width: 0 }), 260);
      }
    }
  }), []);
  useEffect(() => () => { const x = t.current; clearTimeout(x.delay); clearTimeout(x.hide); clearInterval(x.tick); }, []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5" style={{ opacity: state.show ? 1 : 0, transition: 'opacity 200ms ease' }}>
      <div className="h-full bg-brand-600" style={{ width: `${state.width}%`, transition: 'width 220ms ease-out' }} />
    </div>
  );
}
