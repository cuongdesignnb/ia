import { usePageContext } from '../contexts/PageContext';
import { Globe } from 'lucide-react';
import './PageSwitcher.css';

export default function PageSwitcher() {
  const { pages, activePage, selectPage } = usePageContext();

  if (pages.length === 0) return null;

  return (
    <div className="page-switcher">
      <div className="page-switcher-label">Chọn Page</div>
      <div className="page-switcher-list">
        <button
          className={`page-switcher-item ${activePage === null ? 'active' : ''}`}
          onClick={() => selectPage(null)}
        >
          <span className="page-sw-avatar all"><Globe size={14} /></span>
          <span className="page-sw-name">Tất cả</span>
        </button>
        {pages.filter(p => p.is_active).map(page => (
          <button
            key={page.id}
            className={`page-switcher-item ${activePage === page.id ? 'active' : ''}`}
            onClick={() => selectPage(page.id)}
            title={page.name}
          >
            <span className="page-sw-avatar" style={{ background: page.color + '20', color: page.color }}>
              {page.avatar_url ? <img src={page.avatar_url} alt="" /> : page.name.charAt(0)}
            </span>
            <span className="page-sw-name">{page.name}</span>
            {page.post_count > 0 && <span className="page-sw-count">{page.post_count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
