import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyTrendPoint } from '../lib/aggregate';

interface TrendChartProps {
  data: DailyTrendPoint[];
}

const COLOR_WEEKLY = '#2a78d6'; // categorical slot 1 (blue)
const COLOR_DAILY = '#eb6834'; // categorical slot 2 (orange)
const COLOR_TOTAL = '#1baf7a'; // categorical slot 3 (aqua)
const GRIDLINE = '#e1e0d9';
const MUTED_INK = '#898781';

function formatDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function formatPctTick(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function TrendChart({ data }: TrendChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">ยังไม่มีข้อมูล</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIDLINE} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: MUTED_INK, fontSize: 12 }}
          axisLine={{ stroke: GRIDLINE }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          tickFormatter={formatPctTick}
          tick={{ fill: MUTED_INK, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          labelFormatter={(label) => formatDate(String(label))}
          formatter={(value, name) => [`${(Number(value) * 100).toFixed(2)}%`, String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="weeklyPct"
          name="% โอนเทียบแผน Weekly"
          stroke={COLOR_WEEKLY}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="dailyPct"
          name="% โอนเทียบแผน Daily"
          stroke={COLOR_DAILY}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="totalPct"
          name="% โอนเทียบแผน Total"
          stroke={COLOR_TOTAL}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
