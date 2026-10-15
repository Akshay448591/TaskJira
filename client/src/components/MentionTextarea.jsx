import { useState } from 'react';
import { handleOf } from '../lib/constants.js';

// Textarea with @mention autocomplete. A mention is "@" + the part of a teammate's email before "@".
export default function MentionTextarea({ value, onChange, members, ...rest }) {
  const [token, setToken] = useState(null); // { query, start }
  const [active, setActive] = useState(0);

  const detect = (text, caret) => {
    const m = /(^|\s)@([\w.-]*)$/.exec(text.slice(0, caret));
    setToken(m ? { query: m[2].toLowerCase(), start: caret - m[2].length - 1 } : null);
    setActive(0);
  };
  const options = token
    ? members.filter((m) => handleOf(m.user.email).startsWith(token.query) || m.user.name.toLowerCase().includes(token.query)).slice(0, 5)
    : [];

  const pick = (m) => {
    const caret = token.start + 1 + token.query.length;
    const next = `${value.slice(0, token.start)}@${handleOf(m.user.email)} ${value.slice(caret)}`;
    onChange(next);
    setToken(null);
  };
  const onKeyDown = (e) => {
    if (!options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape') { e.stopPropagation(); setToken(null); }
  };

  return (
    <div className="relative">
      <textarea
        className="input"
        value={value}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setToken(null), 150)}
        {...rest}
      />
      {options.length > 0 && (
        <ul className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-pop">
          {options.map((m, i) => (
            <li key={m.user._id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} className={`block w-full px-3 py-2 text-left text-sm ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                <b>{m.user.name}</b> <span className="text-xs text-slate-400">@{handleOf(m.user.email)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Render text with known @mentions highlighted
export function Mentions({ text, members }) {
  const handles = new Set(members.map((m) => handleOf(m.user.email)));
  const parts = text.split(/((?:^|(?<=\s))@[\w.-]+)/g);
  return parts.map((p, i) =>
    p.startsWith('@') && handles.has(p.slice(1).toLowerCase().replace(/[._-]+$/, '')) ? (
      <span key={i} className="rounded bg-brand-50 px-1 font-medium text-brand-700">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}
