'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * useFetchData — a hook that fetches data with automatic timeout, fallback,
 * and loading state management. Never gets stuck — always resolves.
 *
 * Usage:
 *   const { data, loading, error, offline, refresh } = useFetchData(
 *     '/api/reminders',
 *     { fallback: [], isDemo: false, demoData: [...], timeout: 8000 }
 *   );
 */
export function useFetchData<T>(
  url: string | null,
  options: {
    fallback?: T;
    isDemo?: boolean;
    demoData?: T;
    timeout?: number;
    deps?: any[];
  } = {},
) {
  const { fallback = [] as unknown as T, isDemo = false, demoData, timeout = 8000, deps = [] } = options;
  const [data, setData] = useState<T>(isDemo && demoData !== undefined ? demoData : fallback);
  const [loading, setLoading] = useState(!isDemo || demoData === undefined);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    // Demo mode: use demo data immediately
    if (isDemo && demoData !== undefined) {
      setData(demoData);
      setLoading(false);
      setError(null);
      setOffline(false);
      return;
    }

    if (!url) {
      setData(fallback);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        credentials: 'include',
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      setData(json);
      setOffline(false);
    } catch (e) {
      clearTimeout(timeoutId);
      setOffline(true);
      setData(fallback);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [url, isDemo, timeout]);

  useEffect(() => {
    load();
  }, [load, ...deps]);

  return { data, loading, error, offline, refresh: load, setData };
}
