import { useState, useEffect, useCallback, useRef } from 'react';
import Dashboard from './Dashboard';
import Settings from './Settings';
import {
  Scissors,
  Search,
  Plus,
  FolderOpen,
  Layers,
  Sun,
  Moon,
  Save,
  Copy,
  Trash2,
  Clipboard,
  Zap,
  Hash,
  LayoutDashboard,
  Settings as SettingsIcon,
  Tag,
  X,
  Check,
} from 'lucide-react';

function getCategoryClass(cat) {
  if (!cat) return 'general';
  const c = cat.toLowerCase();
  if (c.includes('dev')) return 'dev';
  if (c.includes('email') || c.includes('mail')) return 'email';
  if (c.includes('personal')) return 'personal';
  return 'general';
}

export default function App() {
  const [theme, setTheme] = useState('light');
  const [snippets, setSnippets] = useState([]);
  const [categories, setCategories] = useState([]); // [{id, name, color}]
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [currentView, setCurrentView] = useState('snippets');
  const [toast, setToast] = useState(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const toastTimer = useRef(null);
  const newCatInputRef = useRef(null);

  // ── Initialize ──
  useEffect(() => {
    (async () => {
      if (window.snapcut) {
        const t = await window.snapcut.getTheme();
        setTheme(t);
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
      }
      loadData();
    })();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (showNewCategory && newCatInputRef.current) {
      newCatInputRef.current.focus();
    }
  }, [showNewCategory]);

  const loadData = async () => {
    if (!window.snapcut) return;
    const s = await window.snapcut.getSnippets();
    const c = await window.snapcut.getCategories();
    setSnippets(s);
    setCategories(c);
  };

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  // ── Category names list ──
  const categoryNames = categories.map((c) => c.name);

  // ── Filtered snippets ──
  const filteredSnippets = snippets.filter((s) => {
    const matchCategory = activeCategory === 'All' || s.category === activeCategory;
    const matchSearch =
      !searchQuery ||
      s.shortcut.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.body.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  // ── Select snippet ──
  const selectSnippet = (snippet) => {
    setSelectedId(snippet.id);
    setEditForm({ ...snippet });
    setIsNew(false);
  };

  // ── New snippet ──
  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setCurrentView('snippets');
    setEditForm({
      shortcut: '',
      title: '',
      body: '',
      category: activeCategory === 'All' ? (categoryNames[0] || 'General') : activeCategory,
    });
  };

  // ── Save ──
  const handleSave = async () => {
    if (!editForm || !window.snapcut) return;
    if (!editForm.shortcut.trim() || !editForm.title.trim() || !editForm.body.trim()) {
      showToast('Please fill in all fields');
      return;
    }

    try {
      if (isNew) {
        const created = await window.snapcut.createSnippet(editForm);
        setSelectedId(created.id);
        setIsNew(false);
        showToast('Snippet created!');
      } else {
        await window.snapcut.updateSnippet(selectedId, editForm);
        showToast('Snippet saved!');
      }
      window.snapcut.notifySnippetsChanged();
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err.message || 'Could not save'));
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!selectedId || !window.snapcut) return;
    await window.snapcut.deleteSnippet(selectedId);
    window.snapcut.notifySnippetsChanged();
    setSelectedId(null);
    setEditForm(null);
    setIsNew(false);
    showToast('Snippet deleted');
    await loadData();
  };

  // ── Copy body to clipboard ──
  const handleCopy = async () => {
    if (!editForm?.body) return;
    if (window.snapcut) {
      await window.snapcut.copyToClipboard(editForm.body);
    } else {
      await navigator.clipboard.writeText(editForm.body);
    }
    showToast('Copied to clipboard!');
  };

  // ── Toggle theme ──
  const toggleTheme = async () => {
    if (window.snapcut) {
      const newTheme = await window.snapcut.toggleTheme();
      setTheme(newTheme);
    } else {
      setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    }
  };

  // ── Create category ──
  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (categoryNames.includes(name)) {
      showToast('Category already exists');
      return;
    }
    if (window.snapcut) {
      await window.snapcut.createCategory(name);
      await loadData();
      showToast(`Category "${name}" created`);
    }
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  // ── Delete category ──
  const handleDeleteCategory = async (catId) => {
    if (!window.snapcut) return;
    const result = await window.snapcut.deleteCategory(catId);
    if (result?.error) {
      showToast(result.error);
      return;
    }
    setActiveCategory('All');
    await loadData();
    showToast('Category deleted');
  };

  // ── Count per category ──
  const countFor = (cat) => {
    if (cat === 'All') return snippets.length;
    return snippets.filter((s) => s.category === cat).length;
  };

  return (
    <>
      <div className="drag-region" />
      <div className="app-layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <Scissors size={16} />
            </div>
            <span className="sidebar-title">SnapCut</span>
          </div>

          <div className="sidebar-search">
            <div className="search-input-wrap">
              <Search />
              <input
                className="search-input"
                type="text"
                placeholder="Search snippets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section-title">Views</div>
            <button
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentView('dashboard')}
            >
              <LayoutDashboard />
              <span>Dashboard</span>
            </button>
            <button
              className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentView('settings')}
            >
              <SettingsIcon />
              <span>Settings</span>
            </button>
            <button
              className={`nav-item ${currentView === 'snippets' && activeCategory === 'All' ? 'active' : ''}`}
              onClick={() => { setActiveCategory('All'); setCurrentView('snippets'); setSearchQuery(''); }}
            >
              <Clipboard />
              <span>All Snippets</span>
              <span className="nav-item-count">{snippets.length}</span>
            </button>

            <div className="nav-section-title" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Categories</span>
              <button
                className="nav-add-cat-btn"
                onClick={() => setShowNewCategory(true)}
                title="Add category"
              >
                <Plus size={12} />
              </button>
            </div>

            {/* New category inline input */}
            {showNewCategory && (
              <div className="nav-new-cat">
                <input
                  ref={newCatInputRef}
                  className="nav-new-cat-input"
                  type="text"
                  placeholder="Category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCategory();
                    if (e.key === 'Escape') { setShowNewCategory(false); setNewCategoryName(''); }
                  }}
                />
                <button className="nav-new-cat-ok" onClick={handleCreateCategory}><Check size={12} /></button>
                <button className="nav-new-cat-cancel" onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}><X size={12} /></button>
              </div>
            )}

            {categories.map((cat) => (
              <div key={cat.id} className="nav-item-wrap">
                <button
                  className={`nav-item ${currentView === 'snippets' && activeCategory === cat.name ? 'active' : ''}`}
                  onClick={() => {
                    setActiveCategory(cat.name);
                    setSearchQuery('');
                    setCurrentView('snippets');
                  }}
                >
                  <Tag size={16} />
                  <span>{cat.name}</span>
                  <span className="nav-item-count">{countFor(cat.name)}</span>
                </button>
                {cat.name !== 'General' && (
                  <button
                    className="nav-item-delete"
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                    title={`Delete "${cat.name}"`}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun /> : <Moon />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button onClick={startNew} title="New snippet">
              <Plus />
              <span>New</span>
            </button>
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="main-content">
          {currentView === 'dashboard' ? (
            <Dashboard />
          ) : currentView === 'settings' ? (
            <Settings theme={theme} onToggleTheme={toggleTheme} />
          ) : (
          <div className="content-split">
            {/* Snippet list */}
            <div className="snippet-list-panel">
              <div className="main-header">
                <div>
                  <h2>
                    {activeCategory}
                    <span className="main-header-count">
                      {filteredSnippets.length} snippet{filteredSnippets.length !== 1 ? 's' : ''}
                    </span>
                  </h2>
                </div>
                <button className="btn-new" onClick={startNew}>
                  <Plus /> New
                </button>
              </div>

              <div className="snippet-list">
                {filteredSnippets.length === 0 ? (
                  <div className="detail-empty" style={{ padding: '40px 0' }}>
                    <Clipboard />
                    <p>{searchQuery ? 'No matches found' : 'No snippets yet'}</p>
                  </div>
                ) : (
                  filteredSnippets.map((s) => (
                    <div
                      key={s.id}
                      className={`snippet-card ${selectedId === s.id ? 'active' : ''}`}
                      onClick={() => selectSnippet(s)}
                    >
                      <div className={`snippet-icon ${getCategoryClass(s.category)}`}>
                        <Hash size={16} />
                      </div>
                      <div className="snippet-info">
                        <div className="snippet-info-title">{s.title}</div>
                        <div className="snippet-info-shortcut">{s.shortcut}</div>
                        <div className="snippet-info-preview">
                          {s.body.substring(0, 80).replace(/\n/g, ' ')}
                        </div>
                      </div>
                      <div className="snippet-meta">
                        {s.usage_count > 0 && (
                          <span className="snippet-meta-uses">{s.usage_count}×</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Detail / edit panel */}
            <div className="detail-panel">
              {editForm ? (
                <>
                  <div className="detail-form">
                    <div className="detail-form-row">
                      <div className="form-group">
                        <label className="form-label">Shortcut</label>
                        <input
                          className="form-input mono"
                          type="text"
                          placeholder="e.g. sig1, ty1, dev15"
                          value={editForm.shortcut}
                          onChange={(e) =>
                            setEditForm({ ...editForm, shortcut: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Category</label>
                        <select
                          className="form-select"
                          value={editForm.category}
                          onChange={(e) =>
                            setEditForm({ ...editForm, category: e.target.value })
                          }
                        >
                          {categoryNames.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Title</label>
                      <input
                        className="form-input"
                        type="text"
                        placeholder="Descriptive title..."
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm({ ...editForm, title: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Expanded Text</label>
                      <textarea
                        className="form-textarea"
                        placeholder="The full text that will replace your shortcut..."
                        value={editForm.body}
                        onChange={(e) =>
                          setEditForm({ ...editForm, body: e.target.value })
                        }
                        style={{ flex: 1, minHeight: '220px' }}
                      />
                    </div>

                    {!isNew && editForm.created_at && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span className="status-active">Active</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          Created {new Date(editForm.created_at).toLocaleDateString()}
                        </span>
                        {editForm.usage_count > 0 && (
                          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            Used {editForm.usage_count} time{editForm.usage_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="detail-actions">
                    <button className="btn-save" onClick={handleSave}>
                      <Save /> {isNew ? 'Create' : 'Save Changes'}
                    </button>
                    <button className="btn-copy" onClick={handleCopy}>
                      <Copy /> Copy
                    </button>
                    {!isNew && (
                      <button className="btn-delete" onClick={handleDelete}>
                        <Trash2 /> Delete
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="detail-empty">
                  <Zap size={48} />
                  <p>Select a snippet or create a new one</p>
                  <p style={{ fontSize: '12px', opacity: 0.6 }}>
                    Type your shortcut anywhere → it expands automatically
                  </p>
                </div>
              )}
            </div>
          </div>
          )}
        </main>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
