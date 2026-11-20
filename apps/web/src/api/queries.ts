import type {
  AlertList,
  Aging,
  Bootstrap,
  BorrowerRow,
  Candidates,
  Dashboard,
  InspectionQueuePage,
  ModelAvailabilityResponse,
  Movement,
  Overview,
  Partner,
  PartnerDetail,
  PartnerSummary,
  SettingsResponse,
  StageCounts,
  Transaction,
  TransactionDetail,
  Unit,
  UnitDetail,
  User,
  UtilizationRow,
  AuditEntry,
  CategoryWithCount,
  LocationWithCount,
} from '@wms/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './client.js';

/*
 * Every read is a keyed query (plan section 3). Lists stay fresh for 30 s, reference data for
 * 5 min; a page already seen renders from memory at once and refreshes quietly behind it.
 */

export const STALE = { list: 30_000, reference: 5 * 60_000 } as const;

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** A value that settles a moment after typing stops, so a search box does not fire per key. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export const keys = {
  bootstrap: ['bootstrap'] as const,
  units: (params?: object) => (params ? ['units', params] : ['units']) as QueryKey,
  unit: (code: string) => ['unit', code] as const,
  transactions: (params?: object) =>
    (params ? ['transactions', params] : ['transactions']) as QueryKey,
  transaction: (number: string) => ['transaction', number] as const,
  stageCounts: ['transactions', 'stage-counts'] as const,
  dashboard: ['dashboard'] as const,
  alerts: ['alerts'] as const,
  inspections: (params?: object) =>
    (params ? ['inspections', params] : ['inspections']) as QueryKey,
  reports: (name: string, params?: object) => ['reports', name, params ?? {}] as const,
  users: (params?: object) => (params ? ['users', params] : ['users']) as QueryKey,
  audit: (params?: object) => ['audit', params ?? {}] as const,
  settings: ['settings'] as const,
  categories: ['categories'] as const,
  locations: ['locations'] as const,
  partners: (q: string) => ['partners', q] as const,
  partnerDirectory: (params: object) => ['partners', 'directory', params] as const,
  partner: (id: string) => ['partner', id] as const,
  availability: (from: string, until: string) => ['availability', from, until] as const,
};

/** Drops every cached list a change can affect; detail queries are refreshed by the caller. */
export function useInvalidate() {
  const client = useQueryClient();
  return useCallback(
    (...groups: (keyof typeof keys)[]) =>
      Promise.all(groups.map((group) => client.invalidateQueries({ queryKey: [group] }))),
    [client],
  );
}

export function useBootstrap(enabled = true) {
  return useQuery({
    queryKey: keys.bootstrap,
    queryFn: ({ signal }) => apiGet<Bootstrap>('/bootstrap', undefined, signal),
    staleTime: STALE.reference,
    retry: false,
    enabled,
  });
}

export function useUnits(params: Record<string, unknown>, enabled = true) {
  return useQuery({
    enabled,
    queryKey: keys.units(params),
    queryFn: ({ signal }) => apiGet<Paged<Unit>>('/units', params, signal),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}

export function useUnit(code: string) {
  return useQuery({
    queryKey: keys.unit(code),
    queryFn: ({ signal }) => apiGet<UnitDetail>(`/units/${code}`, undefined, signal),
    staleTime: STALE.list,
  });
}

export function useUnitMovements(code: string, firstCursor: string | null) {
  return useInfiniteQuery({
    queryKey: ['unit', code, 'movements', firstCursor],
    queryFn: ({ pageParam, signal }) =>
      apiGet<{ items: Movement[]; nextCursor: string | null }>(
        `/units/${code}/movements`,
        { cursor: pageParam, limit: 50 },
        signal,
      ),
    initialPageParam: firstCursor ?? '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: false,
  });
}

export function useTransactions(params: Record<string, unknown>, enabled = true) {
  return useQuery({
    enabled,
    queryKey: keys.transactions(params),
    queryFn: ({ signal }) => apiGet<Paged<Transaction>>('/transactions', params, signal),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}

export function useStageCounts() {
  return useQuery({
    queryKey: keys.stageCounts,
    queryFn: ({ signal }) => apiGet<StageCounts>('/transactions/stage-counts', undefined, signal),
    staleTime: STALE.list,
  });
}

export function useTransaction(number: string) {
  return useQuery({
    queryKey: keys.transaction(number),
    queryFn: ({ signal }) =>
      apiGet<TransactionDetail>(`/transactions/${number}`, undefined, signal),
    staleTime: STALE.list,
  });
}

/** Never served from cache: an approver must see what is assignable right now (plan R6). */
export function useCandidates(number: string, enabled: boolean) {
  return useQuery({
    queryKey: ['transaction', number, 'candidates'],
    queryFn: ({ signal }) =>
      apiGet<Candidates>(`/transactions/${number}/candidates`, undefined, signal),
    staleTime: 0,
    gcTime: 0,
    enabled,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: ({ signal }) => apiGet<Dashboard>('/dashboard', undefined, signal),
    staleTime: STALE.list,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: keys.alerts,
    queryFn: ({ signal }) => apiGet<AlertList>('/alerts', { limit: 200 }, signal),
    staleTime: STALE.list,
    refetchInterval: 60_000,
  });
}

export function useInspectionQueue(params: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.inspections(params),
    queryFn: ({ signal }) => apiGet<InspectionQueuePage>('/inspections', params, signal),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}

export function useReport<T>(
  name: 'overview' | 'aging' | 'utilization' | 'borrowers',
  params?: Record<string, unknown>,
) {
  return useQuery({
    queryKey: keys.reports(name, params),
    queryFn: ({ signal }) => apiGet<T>(`/reports/${name}`, params, signal),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}
export type { Aging, BorrowerRow, Overview, UtilizationRow };

export function useTracking(params: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.reports('tracking', params),
    queryFn: ({ signal }) => apiGet<Paged<Movement>>('/reports/tracking', params, signal),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}

export function useUsers(params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: keys.users(params),
    queryFn: ({ signal }) => apiGet<Paged<User>>('/users', params, signal),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAudit(params: Record<string, unknown>, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.audit(params),
    queryFn: ({ pageParam, signal }) =>
      apiGet<{ items: AuditEntry[]; nextCursor: string | null }>(
        '/audit',
        { ...params, cursor: pageParam || undefined, limit: 50 },
        signal,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: STALE.list,
    enabled,
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) => apiGet<SettingsResponse>('/settings', undefined, signal),
    staleTime: STALE.reference,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: ({ signal }) => apiGet<CategoryWithCount[]>('/categories', undefined, signal),
    staleTime: STALE.reference,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: keys.locations,
    queryFn: ({ signal }) => apiGet<LocationWithCount[]>('/locations', undefined, signal),
    staleTime: STALE.reference,
  });
}

export function usePartners(q: string) {
  const settled = useDebounced(q.trim());
  return useQuery({
    queryKey: keys.partners(settled),
    queryFn: ({ signal }) =>
      apiGet<Partner[]>('/partners', { q: settled || undefined, limit: 10 }, signal),
    staleTime: STALE.list,
  });
}

/** The partner directory: every company with its activity (Partners page). */
export function usePartnerDirectory(params: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.partnerDirectory(params),
    queryFn: ({ signal }) => apiGet<Paged<PartnerSummary>>('/partners/directory', params, signal),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}

export function usePartner(id: string | null) {
  return useQuery({
    queryKey: keys.partner(id ?? ''),
    queryFn: ({ signal }) => apiGet<PartnerDetail>(`/partners/${id}`, undefined, signal),
    staleTime: STALE.list,
    enabled: id !== null,
  });
}

export function useAvailability(from: string, until: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.availability(from, until),
    queryFn: ({ signal }) =>
      apiGet<ModelAvailabilityResponse>('/models/availability', { from, until }, signal),
    staleTime: 0,
    enabled: enabled && Boolean(from && until) && until >= from,
  });
}
