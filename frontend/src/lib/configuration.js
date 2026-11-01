import { useEffect, useState } from 'react';
import { api } from './api';

export function useConfiguration() {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      const result = await api('/configuration', { auth: false, silencioso: true });
      if (alive && result.ok) setValue(result.data.document.settings);
    };
    read();
    const interval = setInterval(read, 3000);
    return () => { alive = false; clearInterval(interval); };
  }, []);
  return value;
}
