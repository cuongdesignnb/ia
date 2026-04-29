import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Trash2, Send, Search, RotateCcw, XCircle, Eye } from 'lucide-react';
import { getPosts, deletePost, publishPost, publishDraft, retryPost, cancelPost } from '../utils/api';
import { usePageContext } from '../contexts/PageContext';
import { useToast } from '../components/Toast';
import './PostList.css';

const STATUS_LABELS = {
  draft: 'Bản nháp',
  scheduled: 'Đã lên lịch',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

export default function PostList() {
  const { activePage, activePageData } = usePageContext();
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ total:0, page:1, pages:1 });
  const [filters, setFilters] = useState({ status:'', search:'', page:1 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      if (activePage) params.fb_page_id = activePage;
      const res = await getPosts(params);
      setPosts(res.data.data);
      setPagination(res.data.pagination);
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [filters, activePage]);

  const handleDelete = async (id) => {
    if (!confirm('Bạn có chắc muốn xoá bài viết này?')) return;
    try {
      await deletePost(id);
      toast.success('Đã xoá bài viết');
      load();
    } catch(e) { toast.error(e.response?.data?.error || e.message); }
  };

  const handlePublish = async (id) => {
    if (!confirm('Đăng bài viết này lên Facebook ngay?')) return;
    try { await publishPost(id); toast.success('Đã đăng bài thành công!'); load(); } catch(e) { toast.error(`Đăng lỗi: ${e.response?.data?.error || e.message}`); }
  };

  const handlePublishDraft = async (id) => {
    if (!confirm('Đăng nháp bài viết này lên Facebook? (chỉ admin page thấy)')) return;
    try { await publishDraft(id); toast.success('Đã đăng nháp lên Facebook!'); load(); } catch(e) { toast.error(`Nháp FB lỗi: ${e.response?.data?.error || e.message}`); }
  };

  const handleRetry = async (id) => {
    if (!confirm('Thử lại bài viết này?')) return;
    try { await retryPost(id); toast.info('Đã reset về nháp, bạn có thể đăng lại'); load(); } catch(e) { toast.error(e.response?.data?.error || e.message); }
  };

  const handleCancel = async (id) => {
    if (!confirm('Hủy bài viết này?')) return;
    try { await cancelPost(id); toast.info('Đã hủy bài viết'); load(); } catch(e) { toast.error(e.response?.data?.error || e.message); }
  };

  const statusBadge = (s) => <span className={`badge badge-${s}`}>{STATUS_LABELS[s] || s}</span>;

  return (
    <div className="posts-page animate-in">
      <div className="page-header">
        <div>
          <h1>Quản lý bài viết</h1>
          <p className="page-subtitle">
            {activePageData ? (
              <><span className="page-indicator" style={{ background: activePageData.color }}></span> {activePageData.name} — {pagination.total} bài</>
            ) : (
              `${pagination.total} bài viết`
            )}
          </p>
        </div>
        <Link to="/create" className="btn btn-primary"><PlusCircle size={16} /> Tạo mới</Link>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div style={{position:'relative',flex:1}}><Search size={16} style={{position:'absolute',left:12,top:12,color:'var(--text-muted)'}} /><input style={{paddingLeft:36}} placeholder="Tìm kiếm..." value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value,page:1}))} /></div>
          <select value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value,page:1}))}>
            <option value="">Tất cả trạng thái</option>
            <option value="draft">Bản nháp</option>
            <option value="scheduled">Đã lên lịch</option>
            <option value="published">Đã đăng</option>
            <option value="failed">Thất bại</option>
            <option value="cancelled">Đã hủy</option>
          </select>
        </div>

        {loading ? <div className="page-loading"><div className="loading-spinner"></div></div> : posts.length === 0 ? (
          <div className="empty-state"><p>Không tìm thấy bài viết nào</p></div>
        ) : (
          <table className="posts-table">
            <thead><tr><th>Bài viết</th>{!activePage && <th>Page</th>}<th>Phong cách</th><th>Trạng thái</th><th>Ngày tạo</th><th></th></tr></thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}>
                  <td><div className="post-title-cell">{post.image_url && <img className="post-thumb" src={post.image_url} alt="" />}<span className="post-title-text">{post.title}</span></div></td>
                  {!activePage && (
                    <td>
                      {post.fbPage ? (
                        <span className="page-tag" style={{ color: post.fbPage.color, background: post.fbPage.color + '15' }}>
                          <span className="page-dot" style={{ background: post.fbPage.color }}></span>
                          {post.fbPage.name}
                        </span>
                      ) : <span style={{color:'var(--text-muted)',fontSize:'.8rem'}}>—</span>}
                    </td>
                  )}
                  <td>{post.style ? <span style={{color:post.style.color}}>{post.style.name}</span> : '-'}</td>
                  <td>
                    <div>
                      {statusBadge(post.status)}
                      {post.retry_count > 0 && <span style={{fontSize:'.7rem',color:'var(--text-muted)',marginLeft:4}}>×{post.retry_count}</span>}
                    </div>
                    {post.status === 'failed' && post.error_message && (
                      <div className="post-error-msg" title={post.error_message}>
                        {post.error_message.length > 60 ? post.error_message.slice(0, 60) + '…' : post.error_message}
                      </div>
                    )}
                  </td>
                  <td style={{color:'var(--text-muted)',fontSize:'.8rem'}}>{new Date(post.created_at).toLocaleDateString('vi-VN')}</td>
                  <td><div className="post-actions">
                    {post.status==='draft' && <button className="btn btn-icon btn-ghost" title="Đăng ngay" onClick={()=>handlePublish(post.id)}><Send size={14} /></button>}
                    {post.status==='draft' && <button className="btn btn-icon btn-ghost" title="Nháp FB" onClick={()=>handlePublishDraft(post.id)}><Eye size={14} /></button>}
                    {post.status==='failed' && <button className="btn btn-icon btn-ghost" title="Thử lại" onClick={()=>handleRetry(post.id)}><RotateCcw size={14} /></button>}
                    {['scheduled','draft'].includes(post.status) && <button className="btn btn-icon btn-ghost" title="Hủy" onClick={()=>handleCancel(post.id)}><XCircle size={14} /></button>}
                    <button className="btn btn-icon btn-ghost" title="Xoá" onClick={()=>handleDelete(post.id)}><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
