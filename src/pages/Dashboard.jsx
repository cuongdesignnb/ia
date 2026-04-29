import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, FileText, Clock, CheckCircle, AlertCircle, TrendingUp, Globe } from 'lucide-react';
import { getPostStats, getPosts } from '../utils/api';
import { usePageContext } from '../contexts/PageContext';
import './Dashboard.css';

const STATUS_LABELS = {
  draft: 'Bản nháp',
  scheduled: 'Đã lên lịch',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Thất bại',
};

export default function Dashboard() {
  const { activePage, activePageData } = usePageContext();
  const [stats, setStats] = useState({ total: 0, draft: 0, scheduled: 0, published: 0, failed: 0 });
  const [recentPosts, setRecentPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = activePage ? { fb_page_id: activePage } : {};
        const [statsRes, postsRes] = await Promise.all([
          getPostStats(params),
          getPosts({ limit: 5, ...params }),
        ]);
        setStats(statsRes.data.data);
        setRecentPosts(postsRes.data.data);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, [activePage]);

  const statCards = [
    { label: 'Tổng bài viết', value: stats.total, icon: FileText, color: 'var(--primary)' },
    { label: 'Bản nháp', value: stats.draft, icon: FileText, color: 'var(--text-muted)' },
    { label: 'Đã lên lịch', value: stats.scheduled, icon: Clock, color: 'var(--warning)' },
    { label: 'Đã đăng', value: stats.published, icon: CheckCircle, color: 'var(--success)' },
    { label: 'Thất bại', value: stats.failed, icon: AlertCircle, color: 'var(--danger)' },
  ];

  const statusBadge = (s) => <span className={`badge badge-${s}`}>{STATUS_LABELS[s] || s}</span>;

  if (loading) return <div className="page-loading"><div className="loading-spinner" style={{width:32,height:32}}></div></div>;

  return (
    <div className="dashboard animate-in">
      <div className="page-header">
        <div>
          <h1>Tổng quan</h1>
          <p className="page-subtitle">
            {activePageData ? (
              <><span className="page-indicator" style={{ background: activePageData.color }}></span> {activePageData.name}</>
            ) : (
              'Tổng quan hoạt động đăng bài Facebook'
            )}
          </p>
        </div>
        <Link to="/create" className="btn btn-primary"><PlusCircle size={16} /> Tạo bài viết</Link>
      </div>

      <div className="stats-grid">
        {statCards.map((s, i) => (
          <div key={i} className="stat-card card">
            <div className="stat-icon" style={{ background: s.color + '15', color: s.color }}><s.icon size={20} /></div>
            <div className="stat-info">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card recent-section">
        <div className="section-header">
          <h2><TrendingUp size={18} /> Bài viết gần đây</h2>
          <Link to="/posts" className="btn btn-ghost btn-sm">Xem tất cả</Link>
        </div>
        {recentPosts.length === 0 ? (
          <div className="empty-state">
            <p>Chưa có bài viết nào</p>
            <Link to="/create" className="btn btn-primary btn-sm"><PlusCircle size={14} /> Tạo bài viết đầu tiên</Link>
          </div>
        ) : (
          <div className="recent-list">
            {recentPosts.map(post => (
              <Link key={post.id} to={`/posts`} className="recent-item">
                <div className="recent-info">
                  <span className="recent-title">
                    {post.fbPage && (
                      <span className="page-dot" style={{ background: post.fbPage.color }} title={post.fbPage.name}></span>
                    )}
                    {post.title}
                  </span>
                  <span className="recent-date">{new Date(post.created_at).toLocaleDateString('vi-VN')}</span>
                </div>
                {statusBadge(post.status)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
