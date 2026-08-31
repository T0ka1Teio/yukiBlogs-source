"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { siteConfig as bundledSiteConfig } from '../siteConfig';

export type RuntimeSiteConfig = typeof bundledSiteConfig;

export const RUNTIME_SITE_CONFIG_UPDATED_EVENT = 'yukiblogs:runtime-site-config-updated';

const RuntimeSiteConfigContext = createContext<RuntimeSiteConfig>(bundledSiteConfig);

export function RuntimeSiteConfigProvider({ children }: { children: ReactNode }) {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeSiteConfig>(bundledSiteConfig);

  useEffect(() => {
    let cancelled = false;
    let requestVersion = 0;
    const refreshRuntimeConfig = () => {
      const version = ++requestVersion;
      fetch(`/api/runtime-config?t=${Date.now()}`, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then((payload: { siteConfig?: Partial<RuntimeSiteConfig> }) => {
          if (!cancelled && version === requestVersion && payload.siteConfig) {
            setRuntimeConfig({ ...bundledSiteConfig, ...payload.siteConfig } as RuntimeSiteConfig);
          }
        })
        .catch(() => {});
    };

    refreshRuntimeConfig();
    window.addEventListener(RUNTIME_SITE_CONFIG_UPDATED_EVENT, refreshRuntimeConfig);
    return () => {
      cancelled = true;
      requestVersion += 1;
      window.removeEventListener(RUNTIME_SITE_CONFIG_UPDATED_EVENT, refreshRuntimeConfig);
    };
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
