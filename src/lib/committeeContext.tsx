'use client';
import { createContext, useContext, useMemo } from 'react';
import { useSettings } from '@/components/BrandProvider';
import { Catalog, CommitteeType, STANDARD_TYPE, catalogOf, typeOf } from './catalog';
import { LangProvider } from './i18n';
import { Committee } from './types';

// What the screens need to know about the committee they are showing: its type (flags, groups, field
// names) and the catalog. The language is provided too, so this replaces LangProvider on committee pages.
const Ctx = createContext<{ type: CommitteeType; catalog: Catalog }>({ type: STANDARD_TYPE, catalog: { categories: [], types: [STANDARD_TYPE] } });

export function CommitteeProvider({ committee, children }: { committee?: Pick<Committee, 'language' | 'type'> | null; children: React.ReactNode }) {
  const { settings } = useSettings();
  const catalog = useMemo(() => catalogOf(settings), [settings]);
  const type = typeOf(catalog, committee?.type);
  const value = useMemo(() => ({ type, catalog }), [type, catalog]);
  return (
    <LangProvider lang={committee?.language}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </LangProvider>
  );
}

export const useCommitteeType = () => useContext(Ctx).type;
export const useCatalog = () => useContext(Ctx).catalog;
