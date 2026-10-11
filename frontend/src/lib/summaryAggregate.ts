import { aggregateChannel, type ChannelAggregate } from './aggregate';
import type { TrackingResultRow } from '../types/db';

export type SummaryChannel = 'weekly' | 'daily';

export interface SummaryGroup extends ChannelAggregate {
  key: string;
  /** Destination name for a by-plant group; empty for a by-date group. */
  name: string;
}

export interface ChannelSummary {
  byDate: SummaryGroup[];
  byDest: SummaryGroup[];
  total: ChannelAggregate;
}

/** Only routes this channel's plan file actually covers — same scope as the Weekly/Daily tracking pages. */
export function channelRowsOf(rows: TrackingResultRow[], channel: SummaryChannel): TrackingResultRow[] {
  return rows.filter((r) => Number(channel === 'weekly' ? r.plan_weekly : r.plan_daily) > 0);
}

function groupBy(rows: TrackingResultRow[], keyOf: (r: TrackingResultRow) => string): Map<string, TrackingResultRow[]> {
  const groups = new Map<string, TrackingResultRow[]>();
  for (const r of rows) {
    const key = keyOf(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

/**
 * The source workbook's "แผนโอน Weekly (BSR030)" / "แผนโอน Daily (BDR130)"
 * pivots: one channel's plan vs. actual credited to it, per production date
 * and per destination plant. Each group goes through aggregateChannel, so
 * every figure (incl. the 10% tolerance and Weekly-first actual split) is the
 * same one the Dashboard and tracking pages show, and the groups add up to
 * the grand total — every physical route belongs to exactly one date and one
 * destination.
 */
export function summarizeChannel(rows: TrackingResultRow[], channel: SummaryChannel): ChannelSummary {
  const scoped = channelRowsOf(rows, channel);
  const toGroups = (groups: Map<string, TrackingResultRow[]>, nameOf: (r: TrackingResultRow) => string): SummaryGroup[] =>
    Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([key, groupRows]) => ({ key, name: nameOf(groupRows[0]), ...aggregateChannel(groupRows, channel) }));

  return {
    byDate: toGroups(
      groupBy(scoped, (r) => r.production_date),
      () => '',
    ),
    byDest: toGroups(
      groupBy(scoped, (r) => r.dest_code),
      (r) => r.dest_name,
    ),
    total: aggregateChannel(scoped, channel),
  };
}
