import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config.ts';

const usageCollection = collection(db, 'usageEvents');

type UsageEventStatus = 'success' | 'error' | 'retry';

type UsageEvent = {
  id: string;
  timestamp?: Timestamp | null;
  actionType: string;
  modelUsed: string | null;
  status: UsageEventStatus;
  userId: string | null;
  subscriptionTier: string | null;
  imageCount: number | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
  gcsBytesStored: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  extra: Record<string, unknown> | null;
  estimatedCostUsd?: number | null;
  requestId?: string | null;
};

type FilterState = {
  actionType: string;
  modelUsed: string;
  status: UsageEventStatus | '';
  subscriptionTier: string;
  userId: string;
  lookbackDays: number;
};

const DEFAULT_FILTERS: FilterState = {
  actionType: '',
  modelUsed: '',
  status: '',
  subscriptionTier: '',
  userId: '',
  lookbackDays: 7,
};

const LOOKBACK_OPTIONS = [1, 3, 7, 14, 30];

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return `$${value.toFixed(4)}`;
};

const formatBytes = (bytes: number | null | undefined) => {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let remaining = bytes;
  let index = 0;
  while (remaining >= 1024 && index < units.length - 1) {
    remaining /= 1024;
    index += 1;
  }
  return `${remaining.toFixed(1)} ${units[index]}`;
};

export const UsageDashboard: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitCount, setLimitCount] = useState<number>(100);
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [expandedRequests, setExpandedRequests] = useState<Record<string, Record<string, boolean>>>({});

  const loadEvents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const clauses = [orderBy('timestamp', 'desc'), limit(limitCount)];
      const lookbackTs = Timestamp.fromDate(new Date(Date.now() - filters.lookbackDays * 24 * 60 * 60 * 1000));
      const whereClauses = [where('timestamp', '>=', lookbackTs)];

      if (filters.actionType) {
        whereClauses.push(where('actionType', '==', filters.actionType));
      }
      if (filters.modelUsed) {
        whereClauses.push(where('modelUsed', '==', filters.modelUsed));
      }
      if (filters.status) {
        whereClauses.push(where('status', '==', filters.status));
      }
      if (filters.subscriptionTier) {
        whereClauses.push(where('subscriptionTier', '==', filters.subscriptionTier));
      }
      if (filters.userId) {
        whereClauses.push(where('userId', '==', filters.userId));
      }

      const usageQuery = query(usageCollection, ...whereClauses, ...clauses);
      const snapshot = await getDocs(usageQuery);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UsageEvent));
      setEvents(data);
    } catch (err) {
      console.error('Failed to load usage events', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, limitCount]);

  const aggregated = useMemo(() => {
    if (events.length === 0) {
      return {
        totalEvents: 0,
        totalImages: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalStorageBytes: 0,
        uniqueUsers: 0,
        totalCost: 0,
        byAction: new Map<string, { count: number; cost: number }>(),
        byUser: new Map<string, {
          userId: string;
          subscriptionTier: string | null;
          totalCost: number;
          totalEvents: number;
          totalTokensIn: number;
          totalTokensOut: number;
          totalImages: number;
          totalStorageBytes: number;
          requests: Map<string, {
            requestId: string;
            primaryAction: string;
            totalCost: number;
            totalEvents: number;
            totalTokensIn: number;
            totalTokensOut: number;
            totalImages: number;
            totalStorageBytes: number;
            firstTimestamp?: Timestamp | null;
            lastTimestamp?: Timestamp | null;
            events: UsageEvent[];
          }>;
        }>(),
      };
    }

    const byAction = new Map<string, { count: number; cost: number }>();
    const byUser = new Map<string, {
      userId: string;
      subscriptionTier: string | null;
      totalCost: number;
      totalEvents: number;
      totalTokensIn: number;
      totalTokensOut: number;
      totalImages: number;
      totalStorageBytes: number;
      requests: Map<string, {
        requestId: string;
        primaryAction: string;
        totalCost: number;
        totalEvents: number;
        totalTokensIn: number;
        totalTokensOut: number;
        totalImages: number;
        totalStorageBytes: number;
        firstTimestamp?: Timestamp | null;
        lastTimestamp?: Timestamp | null;
        events: UsageEvent[];
      }>;
    }>();
    let totalImages = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalStorageBytes = 0;
    let totalCost = 0;
    const userIds = new Set<string>();

    events.forEach(event => {
      const existing = byAction.get(event.actionType) ?? { count: 0, cost: 0 };
      existing.count += 1;
      existing.cost += event.estimatedCostUsd ?? 0;
      byAction.set(event.actionType, existing);
      totalImages += event.imageCount ?? 0;
      totalTokensIn += event.inputTokenCount ?? 0;
      totalTokensOut += event.outputTokenCount ?? 0;
      totalStorageBytes += event.gcsBytesStored ?? 0;
      totalCost += event.estimatedCostUsd ?? 0;
      const userKey = event.userId ?? 'unknown';
      userIds.add(userKey);
      const userAggregate = byUser.get(userKey) ?? {
        userId: userKey,
        subscriptionTier: event.subscriptionTier ?? null,
        totalCost: 0,
        totalEvents: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalImages: 0,
        totalStorageBytes: 0,
        requests: new Map(),
      };
      userAggregate.subscriptionTier = event.subscriptionTier ?? userAggregate.subscriptionTier;
      userAggregate.totalCost += event.estimatedCostUsd ?? 0;
      userAggregate.totalEvents += 1;
      userAggregate.totalTokensIn += event.inputTokenCount ?? 0;
      userAggregate.totalTokensOut += event.outputTokenCount ?? 0;
      userAggregate.totalImages += event.imageCount ?? 0;
      userAggregate.totalStorageBytes += event.gcsBytesStored ?? 0;

      const requestKey = (event.requestId ?? event.extra?.requestId ?? event.id) as string;
      const requestAggregate = userAggregate.requests.get(requestKey) ?? {
        requestId: requestKey,
        primaryAction: event.actionType,
        totalCost: 0,
        totalEvents: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalImages: 0,
        totalStorageBytes: 0,
        firstTimestamp: event.timestamp ?? null,
        lastTimestamp: event.timestamp ?? null,
        events: [],
      };
      requestAggregate.primaryAction = requestAggregate.primaryAction || event.actionType;
      requestAggregate.totalCost += event.estimatedCostUsd ?? 0;
      requestAggregate.totalEvents += 1;
      requestAggregate.totalTokensIn += event.inputTokenCount ?? 0;
      requestAggregate.totalTokensOut += event.outputTokenCount ?? 0;
      requestAggregate.totalImages += event.imageCount ?? 0;
      requestAggregate.totalStorageBytes += event.gcsBytesStored ?? 0;
      if (!requestAggregate.firstTimestamp || (event.timestamp && event.timestamp.toMillis() < requestAggregate.firstTimestamp.toMillis())) {
        requestAggregate.firstTimestamp = event.timestamp;
      }
      if (!requestAggregate.lastTimestamp || (event.timestamp && event.timestamp.toMillis() > requestAggregate.lastTimestamp.toMillis())) {
        requestAggregate.lastTimestamp = event.timestamp;
      }
      requestAggregate.events.push(event);
      userAggregate.requests.set(requestKey, requestAggregate);
      byUser.set(userKey, userAggregate);
    });

    return {
      totalEvents: events.length,
      totalImages,
      totalTokensIn,
      totalTokensOut,
      totalStorageBytes,
      uniqueUsers: userIds.size,
      totalCost,
      byAction,
      byUser,
    };
  }, [events]);

  const updateFilter = (field: keyof FilterState, value: string | number | UsageEventStatus | '') => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Usage & Costing</h2>
          <p className="text-sm text-slate-500">Track high-cost events from Gemini, Vertex, and Firebase storage to inform pricing decisions.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Lookback</label>
          <select
            className="rounded-md border border-slate-200 bg-white text-sm px-2 py-1"
            value={filters.lookbackDays}
            onChange={event => updateFilter('lookbackDays', Number(event.target.value))}
          >
            {LOOKBACK_OPTIONS.map(option => (
              <option key={option} value={option}>{option} days</option>
            ))}
          </select>
          <label className="text-sm text-slate-500">Rows</label>
          <select
            className="rounded-md border border-slate-200 bg-white text-sm px-2 py-1"
            value={limitCount}
            onChange={event => setLimitCount(Number(event.target.value))}
          >
            {[50, 100, 250, 500].map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button
            className="px-3 py-1 text-sm border border-slate-200 rounded-md hover:bg-slate-50"
            onClick={resetFilters}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <SummaryCard label="Events" value={aggregated.totalEvents} />
        <SummaryCard label="Images Returned" value={aggregated.totalImages} />
        <SummaryCard label="Prompt Tokens" value={aggregated.totalTokensIn} />
        <SummaryCard label="Output Tokens" value={aggregated.totalTokensOut} />
        <SummaryCard label="Storage" value={formatBytes(aggregated.totalStorageBytes)} />
        <SummaryCard label="Unique Users" value={aggregated.uniqueUsers} />
        <SummaryCard label="Estimated Spend" value={formatCurrency(aggregated.totalCost)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-wrap gap-2 items-center">
            <FilterInput
              label="Action"
              placeholder="e.g. generateCreative"
              value={filters.actionType}
              onChange={value => updateFilter('actionType', value)}
            />
            <FilterInput
              label="Model"
              placeholder="e.g. gemini-2.5-flash"
              value={filters.modelUsed}
              onChange={value => updateFilter('modelUsed', value)}
            />
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select
                className="rounded-md border border-slate-200 bg-white text-sm px-2 py-1"
                value={filters.status}
                onChange={event => updateFilter('status', event.target.value as UsageEventStatus | '')}
              >
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="retry">Retry</option>
                <option value="error">Error</option>
              </select>
            </div>
            <FilterInput
              label="Tier"
              placeholder="e.g. PRO"
              value={filters.subscriptionTier}
              onChange={value => updateFilter('subscriptionTier', value)}
            />
            <FilterInput
              label="User ID"
              placeholder="firebase uid"
              value={filters.userId}
              onChange={value => updateFilter('userId', value)}
            />
          </div>

          <UserTable
            isLoading={isLoading}
            userAggregates={aggregated.byUser}
            expandedUsers={expandedUsers}
            expandedRequests={expandedRequests}
            onToggleUser={userId => setExpandedUsers(prev => ({ ...prev, [userId]: !prev[userId] }))}
            onToggleRequest={(userId, requestId) =>
              setExpandedRequests(prev => ({
                ...prev,
                [userId]: {
                  ...(prev[userId] ?? {}),
                  [requestId]: !prev[userId]?.[requestId],
                },
              }))
            }
          />
        </div>

        <div className="space-y-4">
          <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Events by Action</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              {aggregated.byAction.size === 0 ? (
                <li className="text-slate-400">No data</li>
              ) : (
                Array.from(aggregated.byAction.entries())
                  .sort(([, a], [, b]) => (b.cost - a.cost) || (b.count - a.count))
                  .map(([action, data]) => (
                    <li key={action} className="flex justify-between">
                      <span className="font-medium">{action}</span>
                      <span>{data.count} • {formatCurrency(data.cost)}</span>
                    </li>
                  ))
              )}
            </ul>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Filters</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Combine filters to drill into usage patterns (e.g. show PRO users running `generateCreative`).
              Token counts and storage bytes let you approximate per-user cost when paired with billing rates.
            </p>
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded-lg p-3">
              Failed to load usage events: {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: number | string }) => (
  <div className="border border-slate-200 rounded-lg bg-white p-4 shadow-sm">
    <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 text-lg font-semibold text-slate-900">{typeof value === 'number' ? value.toLocaleString() : value}</div>
  </div>
);

const FilterInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <div className="flex flex-col">
    <label className="text-xs font-medium text-slate-500">{label}</label>
    <input
      type="text"
      className="rounded-md border border-slate-200 bg-white text-sm px-2 py-1"
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
  </div>
);

const UsageRow = ({ event }: { event: UsageEvent }) => {
  const timeAgo = formatRelativeTime(event.timestamp);
  const statusClasses: Record<UsageEventStatus, string> = {
    success: 'bg-emerald-100 text-emerald-700',
    retry: 'bg-amber-100 text-amber-700',
    error: 'bg-rose-100 text-rose-700',
  };

  return (
    <tr className="border-b border-slate-100 text-slate-700 hover:bg-slate-50">
      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{event.actionType}</td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{event.modelUsed ?? '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusClasses[event.status]}`}>
          {event.status}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">{formatNumber(event.imageCount)}</td>
      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">{formatNumber(event.inputTokenCount)}</td>
      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">{formatNumber(event.outputTokenCount)}</td>
      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">{event.latencyMs ? `${event.latencyMs.toFixed(0)} ms` : '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">{formatCurrency(event.estimatedCostUsd)}</td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{timeAgo}</td>
    </tr>
  );
};

const UserTable = ({
  isLoading,
  userAggregates,
  expandedUsers,
  expandedRequests,
  onToggleUser,
  onToggleRequest,
}: {
  isLoading: boolean;
  userAggregates: Map<string, {
    userId: string;
    subscriptionTier: string | null;
    totalCost: number;
    totalEvents: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalImages: number;
    totalStorageBytes: number;
    requests: Map<string, {
      requestId: string;
      primaryAction: string;
      totalCost: number;
      totalEvents: number;
      totalTokensIn: number;
      totalTokensOut: number;
      totalImages: number;
      totalStorageBytes: number;
      firstTimestamp?: Timestamp | null;
      lastTimestamp?: Timestamp | null;
      events: UsageEvent[];
    }>;
  }>;
  expandedUsers: Record<string, boolean>;
  expandedRequests: Record<string, Record<string, boolean>>;
  onToggleUser: (userId: string) => void;
  onToggleRequest: (userId: string, requestId: string) => void;
}) => {
  if (isLoading) {
    return <div className="p-6 text-center text-slate-500">Loading usage events…</div>;
  }

  if (userAggregates.size === 0) {
    return <div className="p-6 text-center text-slate-500">No usage events found for the selected filters.</div>;
  }

  const rows = Array.from(userAggregates.values()).sort((a, b) => (b.totalCost - a.totalCost) || (b.totalEvents - a.totalEvents));

  return (
    <div className="overflow-x-auto max-h-[420px]">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-semibold text-slate-500 uppercase">
            <th className="px-4 py-2">User</th>
            <th className="px-4 py-2">Tier</th>
            <th className="px-4 py-2 text-right">Events</th>
            <th className="px-4 py-2 text-right">Tok In</th>
            <th className="px-4 py-2 text-right">Tok Out</th>
            <th className="px-4 py-2 text-right">Images</th>
            <th className="px-4 py-2 text-right">Storage</th>
            <th className="px-4 py-2 text-right">Spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(user => {
            const isExpanded = expandedUsers[user.userId];
            const requestRows = Array.from(user.requests.values()).sort((a, b) => {
              const timeA = a.lastTimestamp?.toMillis?.() ?? 0;
              const timeB = b.lastTimestamp?.toMillis?.() ?? 0;
              return timeB - timeA;
            });

            return (
              <React.Fragment key={user.userId}>
                <tr
                  className="border-b border-slate-100 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  onClick={() => onToggleUser(user.userId)}
                >
                  <td className="px-4 py-2 font-medium text-slate-900">{user.userId}</td>
                  <td className="px-4 py-2 text-slate-600">{user.subscriptionTier ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{user.totalEvents}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatNumber(user.totalTokensIn)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatNumber(user.totalTokensOut)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatNumber(user.totalImages)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatBytes(user.totalStorageBytes)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatCurrency(user.totalCost)}</td>
                </tr>
                {isExpanded && (
                  <tr className="bg-white">
                    <td colSpan={8} className="px-4 py-2">
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-left font-semibold text-slate-500 uppercase">
                              <th className="px-3 py-2">Request</th>
                              <th className="px-3 py-2">Primary Action</th>
                              <th className="px-3 py-2 text-right">Events</th>
                              <th className="px-3 py-2 text-right">Images</th>
                              <th className="px-3 py-2 text-right">Tok In</th>
                              <th className="px-3 py-2 text-right">Tok Out</th>
                              <th className="px-3 py-2 text-right">Storage</th>
                              <th className="px-3 py-2 text-right">Cost</th>
                              <th className="px-3 py-2">Updated</th>
                            </tr>
                          </thead>
                          <tbody>
                            {requestRows.map(request => {
                              const isRequestExpanded = expandedRequests[user.userId]?.[request.requestId];
                              const updatedAgo = formatRelativeTime(request.lastTimestamp);
                              return (
                                <React.Fragment key={request.requestId}>
                                  <tr
                                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                                    onClick={() => onToggleRequest(user.userId, request.requestId)}
                                  >
                                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{request.requestId.slice(0, 8)}</td>
                                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{request.primaryAction}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{request.totalEvents}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{formatNumber(request.totalImages)}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{formatNumber(request.totalTokensIn)}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{formatNumber(request.totalTokensOut)}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{formatBytes(request.totalStorageBytes)}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(request.totalCost)}</td>
                                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{updatedAgo}</td>
                                  </tr>
                                  {isRequestExpanded && (
                                    <tr>
                                      <td colSpan={9} className="px-3 py-2 bg-white">
                                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                                          <table className="min-w-full">
                                            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                                              <tr>
                                                <th className="px-3 py-2 text-left">Action</th>
                                                <th className="px-3 py-2 text-left">Model</th>
                                                <th className="px-3 py-2 text-left">Status</th>
                                                <th className="px-3 py-2 text-right">Img</th>
                                                <th className="px-3 py-2 text-right">Tok In</th>
                                                <th className="px-3 py-2 text-right">Tok Out</th>
                                                <th className="px-3 py-2 text-right">Latency</th>
                                                <th className="px-3 py-2 text-right">Cost</th>
                                                <th className="px-3 py-2 text-left">When</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {request.events.map(event => (
                                                <UsageRow key={event.id} event={event} />
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const formatRelativeTime = (timestamp?: Timestamp | null) => {
  if (!timestamp) {
    return '—';
  }
  const date = timestamp.toDate?.();
  if (!date) {
    return '—';
  }

  const deltaMs = date.getTime() - Date.now();
  const absMs = Math.abs(deltaMs);
  const minutes = Math.round(absMs / (1000 * 60));
  if (minutes < 60) {
    return relativeTimeFormatter.format(Math.round(deltaMs / (1000 * 60)), 'minute');
  }
  const hours = Math.round(absMs / (1000 * 60 * 60));
  if (hours < 24) {
    return relativeTimeFormatter.format(Math.round(deltaMs / (1000 * 60 * 60)), 'hour');
  }
  const days = Math.round(deltaMs / (1000 * 60 * 60 * 24));
  if (Math.abs(days) < 30) {
    return relativeTimeFormatter.format(days, 'day');
  }
  const months = Math.round(deltaMs / (1000 * 60 * 60 * 24 * 30));
  if (Math.abs(months) < 12) {
    return relativeTimeFormatter.format(months, 'month');
  }
  const years = Math.round(deltaMs / (1000 * 60 * 60 * 24 * 365));
  return relativeTimeFormatter.format(years, 'year');
};
