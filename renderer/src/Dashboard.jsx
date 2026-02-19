import { useState, useEffect } from 'react';
import {
  Zap,
  Keyboard,
  Clock,
  FileText,
  TrendingUp,
  Award,
  Target,
  BarChart3,
  ArrowUpRight,
  Hash,
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

function getCategoryColor(cat) {
  if (!cat) return '#6366f1';
  const c = cat.toLowerCase();
  if (c.includes('dev')) return '#3b82f6';
  if (c.includes('email') || c.includes('mail')) return '#ec4899';
  if (c.includes('personal')) return '#10b981';
  return '#6366f1';
}

function calcTimeSaved(keystrokesSaved, wpm) {
  // WPM → chars per second: avg word = 5 chars, so chars/min = wpm * 5, chars/sec = wpm * 5 / 60
  const charsPerSec = (wpm * 5) / 60;
  return charsPerSec > 0 ? Math.round(keystrokesSaved / charsPerSec) : 0;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wpm, setWpm] = useState(40);

  useEffect(() => {
    loadStats();
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

  const maxDailyCount = stats.dailyExpansions.length > 0
    ? Math.max(...stats.dailyExpansions.map((d) => d.count))
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
        <button className="dash-refresh" onClick={loadStats}>
          <TrendingUp size={14} />
          Refresh
        </button>
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
            <FileText size={20} />
          </div>
          <div className="dash-card-body">
            <div className="dash-card-value">{formatNumber(stats.totalCharsExpanded)}</div>
            <div className="dash-card-label">Chars Produced</div>
          </div>
        </div>
      </div>

      {/* Secondary stats row */}
      <div className="dash-cards secondary">
        <div className="dash-stat-pill">
          <FileText size={14} />
          <span><strong>{stats.totalSnippets}</strong> Total Snippets</span>
        </div>
        <div className="dash-stat-pill">
          <Target size={14} />
          <span><strong>{stats.activeSnippets}</strong> Active Snippets</span>
        </div>
        <div className="dash-stat-pill">
          <BarChart3 size={14} />
          <span><strong>{formatNumber(stats.totalCharsTyped)}</strong> Shortcut Chars Typed</span>
        </div>
        <div className="dash-stat-pill">
          <Award size={14} />
          <span><strong>{stats.avgCharsPerExpansion}</strong> Avg Chars / Expansion</span>
        </div>
      </div>

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
            <div className="dash-bar-chart">
              {stats.topSnippets.map((s, i) => (
                <div key={s.id} className="dash-bar-row">
                  <div className="dash-bar-rank">#{i + 1}</div>
                  <div className="dash-bar-info">
                    <div className="dash-bar-label">
                      <span className="dash-bar-title">{s.title}</span>
                      <span className="dash-bar-shortcut">{s.shortcut}</span>
                    </div>
                    <div className="dash-bar-track">
                      <div
                        className="dash-bar-fill"
                        style={{ width: `${Math.max(8, (s.usage_count / maxUsage) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="dash-bar-value">{s.usage_count}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="dash-right-col">
          {/* Category Breakdown */}
          <div className="dash-section">
            <h3 className="dash-section-title">
              <BarChart3 size={16} />
              By Category
            </h3>
            {stats.categoryBreakdown.length === 0 ? (
              <div className="dash-empty-state small">
                <p>No categories yet</p>
              </div>
            ) : (
              <div className="dash-category-list">
                {stats.categoryBreakdown.map((cat) => (
                  <div key={cat.category} className="dash-category-row">
                    <div
                      className="dash-category-dot"
                      style={{ background: getCategoryColor(cat.category) }}
                    />
                    <div className="dash-category-info">
                      <div className="dash-category-name">{cat.category}</div>
                      <div className="dash-category-bar-track">
                        <div
                          className="dash-category-bar-fill"
                          style={{
                            width: `${Math.max(4, (cat.total_uses / totalCatUses) * 100)}%`,
                            background: getCategoryColor(cat.category),
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
            )}
          </div>

          {/* Recent Activity */}
          <div className="dash-section">
            <h3 className="dash-section-title">
              <Clock size={16} />
              Recent Activity
            </h3>
            {stats.recentExpansions.length === 0 ? (
              <div className="dash-empty-state small">
                <p>No activity yet</p>
              </div>
            ) : (
              <div className="dash-activity-list">
                {stats.recentExpansions.map((exp, i) => (
                  <div key={i} className="dash-activity-row">
                    <div className="dash-activity-icon">
                      <ArrowUpRight size={12} />
                    </div>
                    <div className="dash-activity-info">
                      <span className="dash-activity-title">{exp.title || exp.shortcut}</span>
                      <span className="dash-activity-shortcut">{exp.shortcut}</span>
                    </div>
                    <div className="dash-activity-meta">
                      <span className="dash-activity-chars">
                        +{exp.chars_expanded - exp.chars_shortcut} chars
                      </span>
                      <span className="dash-activity-time">{timeAgo(exp.expanded_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Activity Sparkline */}
      {stats.dailyExpansions.length > 0 && (
        <div className="dash-section full-width">
          <h3 className="dash-section-title">
            <BarChart3 size={16} />
            Daily Activity
            <span className="dash-section-subtitle">Last 30 days</span>
          </h3>
          <div className="dash-sparkline">
            {stats.dailyExpansions.map((d, i) => (
              <div key={i} className="dash-spark-col" title={`${d.day}: ${d.count} expansions`}>
                <div
                  className="dash-spark-bar"
                  style={{ height: `${Math.max(6, (d.count / maxDailyCount) * 100)}%` }}
                />
                <div className="dash-spark-label">
                  {new Date(d.day + 'T00:00:00').toLocaleDateString('en', { day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
