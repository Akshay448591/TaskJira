import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSocket, isConnected, joinRoom, setViewing } from './socket.js';

// join a room while the component is mounted
export function useRoom(type, id) {
  useEffect(() => (id ? joinRoom(type, id) : undefined), [type, id]);
}

// subscribe to a socket event while mounted (handler may change every render)
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = connectSocket();
    const fn = (...a) => ref.current(...a);
    s.on(event, fn);
    return () => s.off(event, fn);
  }, [event]);
}

// publish which project / task this tab is looking at (shown as presence to teammates)
export function useViewing(key, id) {
  useEffect(() => {
    if (!id) return undefined;
    setViewing({ [key]: id });
    return () => setViewing({ [key]: null });
  }, [key, id]);
}

// a function that runs at most once per `ms`, after the last call (coalesces bursts of live events)
export function useDebouncedCallback(fn, ms = 400) {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => ref.current(), ms); }, [ms]);
}

export function useConnected() {
  const [on, setOn] = useState(isConnected());
  useEffect(() => {
    const f = () => setOn(isConnected());
    window.addEventListener('socket:status', f);
    return () => window.removeEventListener('socket:status', f);
  }, []);
  return on;
}
