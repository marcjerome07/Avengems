import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
} from 'recharts';
import { STONE_THEME } from '../../utils/stoneTheme';
import { formatPrice, formatPriceShort } from '../../utils/formatPrice';
import './Charts.css';

/*
  Chart color decisions (validated with the dataviz palette checker):
  - Single-series charts use one bronze hue and no legend; the title names the series.
  - Stone charts color each bar by its own stone (color follows the entity), in an order
    that keeps similar hues apart (purple and blue are never adjacent). The stone palette
    sits in the CVD "secondary encoding required" band, so every bar is labeled on the axis
    and carries a value label: color is never the only cue.
  - Order status uses a dedicated set with a labeled legend plus counts, and 2px gaps between slices.
*/

const INK = '#2A2622';
const MUTED = '#8F877E';
const GRID = '#EFEAE2';
const SERIES = '#8C6E45'; // bronze, for single-series charts

const CHART_STONE_ORDER = ['power', 'soul', 'space', 'mind', 'reality', 'time'];

const STATUS_COLORS = {
  Pending: '#D2AC45',
  Processing: '#5F8FCB',
  Shipped: '#6E559C',
  Delivered: '#6F927C',
  Cancelled: '#B5505E',
};

const axisProps = {
  tick: { fill: MUTED, fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' },
  tickLine: false,
  axisLine: { stroke: GRID },
};

function swatchFor(p) {
  if (p.payload?.stone) return STONE_THEME[p.payload.stone].base;
  if (p.payload?.status) return STATUS_COLORS[p.payload.status];
  return p.color ?? SERIES;
}

function ChartTooltip({ active, payload, label, valueFormatter = formatPrice, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{labelFormatter ? labelFormatter(label, payload) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="chart-tooltip__row">
          <span className="chart-tooltip__swatch" style={{ background: swatchFor(p) }} aria-hidden="true" />
          <span>{p.name}</span>
          <strong>{valueFormatter(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

/** Revenue over the last months: single line, crosshair tooltip. */
export function SalesLineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} width={64} tickFormatter={(v) => formatPriceShort(v)} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: MUTED, strokeDasharray: '3 3' }} />
        <Line
          type="monotone"
          dataKey="sales"
          name="Sales"
          isAnimationActive={false}
          stroke={SERIES}
          strokeWidth={2}
          dot={{ r: 4, fill: SERIES, stroke: '#fff', strokeWidth: 2 }}
          activeDot={{ r: 6, fill: SERIES, stroke: '#fff', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Order status share: donut + labeled legend with counts. */
export function StatusDonut({ data }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  const visible = data.filter((d) => d.count > 0);
  return (
    <div className="donut">
      <div className="donut__chart">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={visible}
              dataKey="count"
              nameKey="status"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {visible.map((d) => (
                <Cell key={d.status} fill={STATUS_COLORS[d.status]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} orders`} labelFormatter={(_, p) => p?.[0]?.name} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut__center" aria-hidden="true">
          <span className="donut__total">{total}</span>
          <span className="donut__caption">orders</span>
        </div>
      </div>
      <ul className="chart-legend" role="list">
        {data.map((d) => (
          <li key={d.status}>
            <span className="chart-legend__swatch" style={{ background: STATUS_COLORS[d.status] }} aria-hidden="true" />
            <span className="chart-legend__name">{d.status}</span>
            <span className="chart-legend__value">
              {d.count} <span>({total ? Math.round((d.count / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Revenue per stone: each bar in its stone color, labeled on axis and with its value. */
export function StoneBarChart({ data }) {
  const ordered = CHART_STONE_ORDER.map((s) => data.find((d) => d.stone === s)).filter(Boolean);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={ordered} margin={{ top: 28, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="color" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} width={64} tickFormatter={(v) => formatPriceShort(v)} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(42,38,34,0.04)' }} />
        <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {ordered.map((d) => (
            <Cell key={d.stone} fill={STONE_THEME[d.stone].base} />
          ))}
          <LabelList
            dataKey="revenue"
            position="top"
            formatter={(v) => formatPriceShort(v)}
            style={{ fill: INK, fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series horizontal bars (e.g. revenue by jewelry type). */
export function SimpleBarChart({ data, categoryKey, valueKey = 'revenue', name = 'Revenue', valueFormatter = formatPriceShort }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 52)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 8 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" {...axisProps} tickFormatter={valueFormatter} />
        <YAxis type="category" dataKey={categoryKey} {...axisProps} width={80} />
        <Tooltip
          content={<ChartTooltip valueFormatter={valueKey === 'revenue' ? formatPrice : (v) => v} />}
          cursor={{ fill: 'rgba(42,38,34,0.04)' }}
        />
        <Bar dataKey={valueKey} name={name} fill={SERIES} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey={valueKey}
            position="right"
            formatter={valueFormatter}
            style={{ fill: INK, fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
