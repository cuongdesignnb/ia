import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, FileText, Settings, Zap, Globe, Bot, CheckSquare, Image } from 'lucide-react';
import PageSwitcher from './PageSwitcher';
import './Sidebar.css';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tổng quan' },
  { to: '/auto-content', icon: Bot, label: 'Auto Content' },
  { to: '/create', icon: PlusCircle, label: 'Tạo bài viết' },
  { to: '/posts', icon: FileText, label: 'Quản lý bài viết' },
  { to: '/pages', icon: Globe, label: 'Quản lý Pages' },
  { to: '/media', icon: Image, label: 'Media Library' },
  { to: '/settings', icon: Settings, label: 'Cài đặt' },
];

export default function Sidebar({ isOpen }) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-icon"><Zap size={20} /></div>
        <span className="brand-text">IA Creator</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <PageSwitcher />
    </aside>
  );
}
