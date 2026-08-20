"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { siteConfig as bundledSiteConfig } from '../siteConfig';

export type RuntimeSiteConfig = typeof bundledSiteConfig;

const RuntimeSiteConfigContext = createContext<RuntimeSiteConfig>(bundledSiteConfig);

export function RuntimeSiteConfigProvider({ children }: { children: ReactNode }) {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeSiteConfig>(bundledSiteConfig);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runtime-config?t=${Date.now()}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((payload: { siteConfig?: Partial<RuntimeSiteConfig> }) => {
        if (!cancelled && payload.siteConfig) {
          setRuntimeConfig({ ...bundledSiteConfig, ...payload.siteConfig } as RuntimeSiteConfig);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <RuntimeSiteConfigContext.Provider value={runtimeConfig}>
      {children}
    </RuntimeSiteConfigContext.Provider>
  );
}

export function useRuntimeSiteConfig() {
  return useContext(RuntimeSiteConfigContext);
}
