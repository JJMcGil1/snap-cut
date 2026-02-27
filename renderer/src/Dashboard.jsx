import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  Keyboard,
  Clock,
  Layers,
  TrendingUp,
  Award,
  Target,
  BarChart3,
  ArrowUpRight,
  Type,
} from 'lucide-react';

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// Default fallback colors — muted, balanced palette
const FALLBACK_COLORS = ['#c9717a', '#7a9ec7', '#5dab83', '#9b86b8', '#c99460', '#5da89c'];

function getCategoryColor(catName, categoryMap) {
  if (categoryMap && categoryMap[catName]) return categoryMap[catName];
  // Fallback: hash the name to pick a stable color
  if (!catName) return FALLBACK_COLORS[0];
  const hash = catName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function calcTimeSaved(keystrokesSaved, wpm) {
  // WPM → chars per second: avg word = 5 chars, so chars/min = wpm * 5, chars/sec = wpm * 5 / 60
  const charsPerSec = (wpm * 5) / 60;
  return charsPerSec > 0 ? Math.round(keystrokesSaved / charsPerSec) : 0;
}

// Build a smooth cubic bezier SVG path through points
function smoothPath(pts) {
  if (pts.length < 2) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function DailyLineChart({ data }) {
  const [hovered, setHovered] = useState(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Debounced resize via rAF — no lag
    const ro = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const w = el.offsetWidth;
        if (w > 0) setWidth(w);
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  if (!data || data.length === 0 || width === 0) {
    return <div ref={containerRef} style={{ width: '100%', height: 180 }} />;
  }

  const W = width;
  const H = 180;
  const PAD_LEFT = 40;
  const PAD_RIGHT = 16;
  const PAD_TOP = 20;
  const PAD_BOTTOM = 28;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + chartH;

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Nice Y-axis: 5 evenly spaced ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(maxCount * p));

  const points = data.map((d, i) => {
    const x = PAD_LEFT + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = PAD_TOP + chartH - (d.count / maxCount) * chartH;
    return { x, y, ...d };
  });

  const linePath = smoothPath(points);
  const areaPath = linePath + ` L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;

  return (
    <div ref={containerRef} className="dash-line-chart-wrap" style={{ position: 'relative', width: '100%' }}>
      <svg width={W} height={H} style={{ display: 'block' }} onMouseLeave={() => setHovered(null)}>
        <defs>
          <linearGradient id="chartAreaGrad" x1="0" y1={PAD_TOP} x2="0" y2={baseline} gradientUnits="userSpaceOnUse">
            <stop offset="0%" className="dash-chart-grad-top" />
            <stop offset="100%" className="dash-chart-grad-bottom" />
          </linearGradient>
        </defs>

        {/* Y axis ticks + light grid */}
        {yTicks.map((tick, i) => {
          const y = PAD_TOP + chartH - (tick / maxCount) * chartH;
          return (
            <g key={i}>
              {tick > 0 && (
                <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y}
                  stroke="var(--border-primary)" strokeWidth="0.5" opacity="0.4" />
              )}
              <text x={PAD_LEFT - 8} y={y + 4} textAnchor="end" fontSize="10"
                fill="var(--text-tertiary)">{tick}</text>
            </g>
          );
        })}

        {/* X labels */}
        {points.map((p, i) => {
          const showEvery = Math.max(1, Math.floor(data.length / 8));
          if (i % showEvery !== 0 && i !== data.length - 1) return null;
          const label = new Date(p.day + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
          return (
            <text key={i} x={p.x} y={H - 4} textAnchor="middle" fontSize="10"
              fill="var(--text-tertiary)">{label}</text>
          );
        })}

        {/* Area fill — gradient: strong at line, fades to transparent */}
        <path d={areaPath} fill="url(#chartAreaGrad)" />

        {/* Glow layers — theme-aware */}
        <path d={linePath} className="dash-chart-glow-outer" />
        <path d={linePath} className="dash-chart-glow-inner" />

        {/* Main line */}
        <path d={linePath} className="dash-chart-line" />

        {/* Hover vertical line */}
        {hovered !== null && (
          <line
            x1={points[hovered].x} y1={PAD_TOP}
            x2={points[hovered].x} y2={baseline}
            className="dash-chart-hover-line"
          />
        )}

        {/* Data dots */}
        {points.map((p, i) => {
          const isActive = hovered === i;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="18" fill="transparent"
                onMouseEnter={() => setHovered(i)} style={{ cursor: 'pointer' }} />
              {isActive && <circle cx={p.x} cy={p.y} r="16" className="dash-chart-dot-ring-outer" />}
              {isActive && <circle cx={p.x} cy={p.y} r="10" className="dash-chart-dot-ring-inner" />}
              <circle
                cx={p.x} cy={p.y}
                r={isActive ? 5 : 3}
                className={isActive ? 'dash-chart-dot active' : 'dash-chart-dot'}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}
      </svg>

      {hovered !== null && (
        <div className="dash-chart-tooltip" style={{
          position: 'absolute',
          left: points[hovered].x,
          top: points[hovered].y - 24,
          transform: 'translate(-50%, -100%)',
        }}>
          <div className="dash-chart-tooltip-value">{points[hovered].count} expansions</div>
          <div className="dash-chart-tooltip-date">
            {new Date(points[hovered].day + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ categories = [] }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wpm, setWpm] = useState(40);

  // Build name→color map from categories prop
  const categoryColorMap = {};
  categories.forEach((c) => { categoryColorMap[c.name] = c.color; });

  useEffect(() => {
    loadStats();

    // Subscribe to real-time expansion events from the main process
    if (window.snapcut?.onExpansionDone) {
      const cleanup = window.snapcut.onExpansionDone(() => {
        loadStats();
      });
      return cleanup; // unsubscribe on unmount
    }
  }, []);

  const loadStats = async () => {
    if (!window.snapcut) return;
    try {
      const s = await window.snapcut.getStats();
      setStats(s);
      setWpm(s.wpm || 40);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dash-loading">Loading stats...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="dashboard">
        <div className="dash-loading">Could not load stats</div>
      </div>
    );
  }

  const timeSavedSeconds = calcTimeSaved(stats.keystrokesSaved, wpm);

  const maxUsage = stats.topSnippets.length > 0
    ? Math.max(...stats.topSnippets.map((s) => s.usage_count))
    : 1;



  const totalCatUses = stats.categoryBreakdown.reduce((sum, c) => sum + c.total_uses, 0) || 1;


  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Your SnapCut productivity at a glance</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="dash-cards">
        <div className="dash-card">
          <div className="dash-card-icon purple">
            <Zap size={20} />
          </div>
          <div className="dash-card-body">
            <div className="dash-card-value">{formatNumber(stats.totalExpansions)}</div>
            <div className="dash-card-label">Total Expansions</div>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-icon blue">
            <Keyboard size={20} />
          </div>
          <div className="dash-card-body">
            <div className="dash-card-value">{formatNumber(stats.keystrokesSaved)}</div>
            <div className="dash-card-label">Keystrokes Saved</div>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-icon green">
            <Clock size={20} />
          </div>
          <div className="dash-card-body">
            <div className="dash-card-value">{formatTime(timeSavedSeconds)}</div>
            <div className="dash-card-label">Time Saved</div>
            <div className="dash-card-hint">at {wpm} WPM</div>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-icon orange">
            <Layers size={20} />
          </div>
          <div className="dash-card-body">
            <div className="dash-card-value">{stats.totalSnippets}</div>
            <div className="dash-card-label">Total Snippets</div>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-icon pink">
            <Type size={20} />
          </div>
          <div className="dash-card-body">
            <div className="dash-card-value">{formatNumber(stats.totalCharsTyped)}</div>
            <div className="dash-card-label">Shortcut Chars Typed</div>
          </div>
        </div>

      </div>

      {/* Daily Activity Line Chart */}
      {stats.dailyExpansions.length > 0 && (
        <div className="dash-section full-width" style={{ marginBottom: 16 }}>
          <h3 className="dash-section-title">
            <TrendingUp size={16} />
            Daily Activity
            <span className="dash-section-subtitle">Last 30 days</span>
          </h3>
          <DailyLineChart data={stats.dailyExpansions} />
        </div>
      )}

      <div className="dash-grid">
        {/* Top Snippets */}
        <div className="dash-section">
          <h3 className="dash-section-title">
            <TrendingUp size={16} />
            Top Snippets
          </h3>
          {stats.topSnippets.length === 0 ? (
            <div className="dash-empty-state">
              <Zap size={28} />
              <p>No expansions yet</p>
              <p className="dash-empty-sub">Start using your shortcuts to see stats here</p>
            </div>
          ) : (
            <div className="dash-snippet-list">
              {stats.topSnippets.map((s, i) => {
                const pct = Math.max(2, (s.usage_count / maxUsage) * 100);
                return (
                  <div key={s.id} className="dash-snippet-item" data-rank={i + 1}>
                    <div className="dash-snippet-row">
                      <span className="dash-snippet-name">{s.title}</span>
                      <code className="dash-snippet-tag">{s.shortcut}</code>
                      <span className="dash-snippet-uses">{s.usage_count}</span>
                    </div>
                    <div className="dash-snippet-track">
                      <div className="dash-snippet-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Breakdown (only if more than 1 category) */}
        {stats.categoryBreakdown.length > 1 && (
          <div className="dash-section">
            <h3 className="dash-section-title">
              <BarChart3 size={16} />
              By Category
            </h3>
            <div className="dash-category-list">
              {stats.categoryBreakdown.map((cat) => (
                <div key={cat.category} className="dash-category-row">
                  <div
                    className="dash-category-dot"
                    style={{ background: getCategoryColor(cat.category, categoryColorMap) }}
                  />
                  <div className="dash-category-info">
                    <div className="dash-category-name">{cat.category}</div>
                    <div className="dash-category-bar-track">
                      <div
                        className="dash-category-bar-fill"
                        style={{
                          width: `${Math.max(4, (cat.total_uses / totalCatUses) * 100)}%`,
                          background: getCategoryColor(cat.category, categoryColorMap),
                        }}
                      />
                    </div>
                  </div>
                  <div className="dash-category-stats">
                    <span className="dash-category-count">{cat.count} snippets</span>
                    <span className="dash-category-uses">{cat.total_uses} uses</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
