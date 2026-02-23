import { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Tag,
  Folder,
  Code,
  Mail,
  User,
  Briefcase,
  Heart,
  Star,
  Zap,
  Globe,
  BookOpen,
  MessageSquare,
  Shield,
  Coffee,
} from 'lucide-react';

const ICON_OPTIONS = [
  { name: 'tag', Icon: Tag },
  { name: 'folder', Icon: Folder },
  { name: 'code', Icon: Code },
  { name: 'mail', Icon: Mail },
  { name: 'user', Icon: User },
  { name: 'briefcase', Icon: Briefcase },
  { name: 'heart', Icon: Heart },
  { name: 'star', Icon: Star },
  { name: 'zap', Icon: Zap },
  { name: 'globe', Icon: Globe },
  { name: 'book-open', Icon: BookOpen },
  { name: 'message-square', Icon: MessageSquare },
  { name: 'shield', Icon: Shield },
  { name: 'coffee', Icon: Coffee },
];

const COLOR_OPTIONS = [
  '#dc3c48', // red (accent)
  '#e8665a', // coral
  '#d4924a', // amber
  '#c6a832', // gold
  '#3cba76', // green
  '#2ba89c', // teal
  '#5887cc', // blue
  '#6772cc', // indigo
  '#9b7db8', // purple
  '#c26dac', // pink
  '#8b8b8b', // gray
  '#a0785a', // brown
];

export function getCategoryIcon(iconName) {
  const found = ICON_OPTIONS.find((o) => o.name === iconName);
  return found ? found.Icon : Tag;
}

export default function CategoryModal({ category, onSave, onClose }) {
  const [name, setName] = useState(category?.name || '');
  const [color, setColor] = useState(category?.color || COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState(category?.icon || 'tag');
  const nameRef = useRef(null);

  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), color, icon });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {category ? 'Edit Category' : 'New Category'}
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Preview */}
          <div className="modal-preview">
            <div
              className="modal-preview-icon"
              style={{ background: color + '20', color: color }}
            >
              {(() => {
                const IconComp = getCategoryIcon(icon);
                return <IconComp size={20} />;
              })()}
            </div>
            <span className="modal-preview-name" style={{ color }}>
              {name || 'Category'}
            </span>
          </div>

          {/* Name */}
          <div className="modal-field">
            <label className="modal-label">Name</label>
            <input
              ref={nameRef}
              className="modal-input"
              type="text"
              placeholder="Category name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* Color */}
          <div className="modal-field">
            <label className="modal-label">Color</label>
            <div className="modal-color-grid">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  className={`modal-color-swatch ${color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={12} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="modal-field">
            <label className="modal-label">Icon</label>
            <div className="modal-icon-grid">
              {ICON_OPTIONS.map(({ name: n, Icon }) => (
                <button
                  key={n}
                  className={`modal-icon-btn ${icon === n ? 'active' : ''}`}
                  onClick={() => setIcon(n)}
                  style={icon === n ? { borderColor: color, color, background: color + '15' } : {}}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn-save"
            onClick={handleSave}
            style={{ background: color }}
          >
            <Check size={14} />
            {category ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
