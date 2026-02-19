import { useState, useEffect, useRef } from 'react';
import {
  Keyboard,
  Clock,
  Palette,
  Database,
  Download,
  Upload,
  Trash2,
  Info,
  ChevronRight,
  Check,
  X,
  Gauge,
  MonitorSmartphone,
  Power,
  BellOff,
  Volume2,
} from 'lucide-react';

/* ─── Toggle switch ─── */
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      className={`stg-toggle ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="stg-toggle-knob" />
    </button>
  );
}

export default function Settings({ theme, onToggleTheme }) {
  const [wpm, setWpm] = useState(40);
  const [wpmInput, setWpmInput] = useState('40');
  const [editingWpm, setEditingWpm] = useState(false);
  const [triggerSpace, setTriggerSpace] = useState(true);
  const [triggerEnter, setTriggerEnter] = useState(true);
  const [triggerTab, setTriggerTab] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [snippetCount, setSnippetCount] = useState(0);
  const [expansionCount, setExpansionCount] = useState(0);
  const [dbSize, setDbSize] = useState('—');
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState(null);
  const wpmRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (editingWpm && wpmRef.current) {
      wpmRef.current.focus();
      wpmRef.current.select();
    }
  }, [editingWpm]);

  const loadSettings = async () => {
    if (!window.snapcut) return;
    try {
      const stats = await window.snapcut.getStats();
      setSnippetCount(stats.totalSnippets || 0);
      setExpansionCount(stats.totalExpansions || 0);
      const w = stats.wpm || 40;
      setWpm(w);
      setWpmInput(String(w));

      // Load trigger key settings
      const tSpace = await window.snapcut.getSetting('trigger_space');
      const tEnter = await window.snapcut.getSetting('trigger_enter');
      const tTab = await window.snapcut.getSetting('trigger_tab');
      const snd = await window.snapcut.getSetting('sound_enabled');
      if (tSpace !== null) setTriggerSpace(tSpace === 'true');
      if (tEnter !== null) setTriggerEnter(tEnter === 'true');
      if (tTab !== null) setTriggerTab(tTab === 'true');
      if (snd !== null) setSoundEnabled(snd === 'true');

      // DB info
      const info = await window.snapcut.getDbInfo();
      if (info?.size) setDbSize(info.size);
    } catch (err) {
      console.error('Settings load error:', err);
    }
  };

  const flash = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  /* ─── WPM ─── */
  const saveWpm = async () => {
    const val = parseInt(wpmInput, 10);
    if (!val || val < 1 || val > 300) {
      setWpmInput(String(wpm));
      setEditingWpm(false);
      return;
    }
    setWpm(val);
    setEditingWpm(false);
    if (window.snapcut) {
      await window.snapcut.setSetting('wpm', String(val));
    }
    flash('Typing speed updated');
  };

  /* ─── Trigger keys ─── */
  const saveTrigger = async (key, val) => {
    if (window.snapcut) {
      await window.snapcut.setSetting(key, String(val));
      window.snapcut.notifySnippetsChanged(); // refresh key listener
    }
  };

  /* ─── Sound ─── */
  const handleSound = async (val) => {
    setSoundEnabled(val);
    if (window.snapcut) await window.snapcut.setSetting('sound_enabled', String(val));
  };

  /* ─── Export ─── */
  const handleExport = async () => {
    if (!window.snapcut) return;
    try {
      const result = await window.snapcut.exportSnippets();
      if (result?.success) flash(`Exported ${result.count} snippets`);
      else if (result?.error) flash(result.error);
    } catch { flash('Export failed'); }
  };

  /* ─── Import ─── */
  const handleImport = async () => {
    if (!window.snapcut) return;
    try {
      const result = await window.snapcut.importSnippets();
      if (result?.success) {
        flash(`Imported ${result.count} snippets`);
        window.snapcut.notifySnippetsChanged();
        loadSettings();
      } else if (result?.error) flash(result.error);
      else if (result?.cancelled) {} // user cancelled
    } catch { flash('Import failed'); }
  };

  /* ─── Clear history ─── */
  const handleClearHistory = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    if (!window.snapcut) return;
    await window.snapcut.clearExpansionHistory();
    setConfirmClear(false);
    setExpansionCount(0);
    flash('Expansion history cleared');
  };

  return (
    <div className="settings">
      <div className="stg-header">
        <h1 className="stg-title">Settings</h1>
        <p className="stg-subtitle">Configure SnapCut to work your way</p>
      </div>

      {/* ─── Typing Speed ─── */}
      <section className="stg-section">
        <div className="stg-section-label">
          <Gauge size={15} />
          <span>Typing Speed</span>
        </div>
        <div className="stg-card">
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Words per minute</div>
              <div className="stg-row-desc">Used to calculate time saved on the dashboard</div>
            </div>
            <div className="stg-row-action">
              {editingWpm ? (
                <span className="stg-wpm-edit">
                  <input
                    ref={wpmRef}
                    className="stg-wpm-input"
                    type="number"
                    min="1"
                    max="300"
                    value={wpmInput}
                    onChange={(e) => setWpmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveWpm();
                      if (e.key === 'Escape') { setEditingWpm(false); setWpmInput(String(wpm)); }
                    }}
                    onBlur={saveWpm}
                  />
                  <span className="stg-wpm-unit">WPM</span>
                </span>
              ) : (
                <button className="stg-value-btn" onClick={() => { setEditingWpm(true); setWpmInput(String(wpm)); }}>
                  {wpm} WPM
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Expansion ─── */}
      <section className="stg-section">
        <div className="stg-section-label">
          <Keyboard size={15} />
          <span>Expansion</span>
        </div>
        <div className="stg-card">
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Trigger on Space</div>
              <div className="stg-row-desc">Expand snippet when you press space after shortcut</div>
            </div>
            <div className="stg-row-action">
              <Toggle checked={triggerSpace} onChange={(v) => { setTriggerSpace(v); saveTrigger('trigger_space', v); }} />
            </div>
          </div>
          <div className="stg-divider" />
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Trigger on Enter</div>
              <div className="stg-row-desc">Expand snippet when you press enter after shortcut</div>
            </div>
            <div className="stg-row-action">
              <Toggle checked={triggerEnter} onChange={(v) => { setTriggerEnter(v); saveTrigger('trigger_enter', v); }} />
            </div>
          </div>
          <div className="stg-divider" />
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Trigger on Tab</div>
              <div className="stg-row-desc">Expand snippet when you press tab after shortcut</div>
            </div>
            <div className="stg-row-action">
              <Toggle checked={triggerTab} onChange={(v) => { setTriggerTab(v); saveTrigger('trigger_tab', v); }} />
            </div>
          </div>
          <div className="stg-divider" />
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Expansion sound</div>
              <div className="stg-row-desc">Play a subtle sound when a snippet expands</div>
            </div>
            <div className="stg-row-action">
              <Toggle checked={soundEnabled} onChange={handleSound} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Appearance ─── */}
      <section className="stg-section">
        <div className="stg-section-label">
          <Palette size={15} />
          <span>Appearance</span>
        </div>
        <div className="stg-card">
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Theme</div>
              <div className="stg-row-desc">Switch between light and dark mode</div>
            </div>
            <div className="stg-row-action">
              <div className="stg-theme-switcher">
                <button
                  className={`stg-theme-opt ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => theme !== 'light' && onToggleTheme()}
                >
                  Light
                </button>
                <button
                  className={`stg-theme-opt ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => theme !== 'dark' && onToggleTheme()}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Data ─── */}
      <section className="stg-section">
        <div className="stg-section-label">
          <Database size={15} />
          <span>Data</span>
        </div>
        <div className="stg-card">
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Export snippets</div>
              <div className="stg-row-desc">Save all snippets as a JSON file</div>
            </div>
            <div className="stg-row-action">
              <button className="stg-action-btn" onClick={handleExport}>
                <Download size={14} />
                Export
              </button>
            </div>
          </div>
          <div className="stg-divider" />
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Import snippets</div>
              <div className="stg-row-desc">Load snippets from a JSON file</div>
            </div>
            <div className="stg-row-action">
              <button className="stg-action-btn" onClick={handleImport}>
                <Upload size={14} />
                Import
              </button>
            </div>
          </div>
          <div className="stg-divider" />
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">Clear expansion history</div>
              <div className="stg-row-desc">Remove all expansion logs and reset stats</div>
            </div>
            <div className="stg-row-action">
              <button
                className={`stg-action-btn danger ${confirmClear ? 'confirm' : ''}`}
                onClick={handleClearHistory}
              >
                {confirmClear ? (
                  <><Check size={14} /> Confirm</>
                ) : (
                  <><Trash2 size={14} /> Clear</>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── About ─── */}
      <section className="stg-section">
        <div className="stg-section-label">
          <Info size={15} />
          <span>About</span>
        </div>
        <div className="stg-card">
          <div className="stg-row">
            <div className="stg-row-text">
              <div className="stg-row-title">SnapCut</div>
              <div className="stg-row-desc">Version 1.0.0</div>
            </div>
          </div>
          <div className="stg-divider" />
          <div className="stg-row compact">
            <span className="stg-meta-label">Snippets</span>
            <span className="stg-meta-value">{snippetCount}</span>
          </div>
          <div className="stg-divider" />
          <div className="stg-row compact">
            <span className="stg-meta-label">Total expansions</span>
            <span className="stg-meta-value">{expansionCount.toLocaleString()}</span>
          </div>
          <div className="stg-divider" />
          <div className="stg-row compact">
            <span className="stg-meta-label">Database size</span>
            <span className="stg-meta-value">{dbSize}</span>
          </div>
        </div>
      </section>

      <div className="stg-footer">
        Built with care. Type less, do more.
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
