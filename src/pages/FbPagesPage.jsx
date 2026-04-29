import { useState, useEffect } from 'react';
import { Globe, PlusCircle, Trash2, RefreshCw, Eye, EyeOff, CheckCircle, XCircle, Loader, Edit, Users, ToggleLeft, ToggleRight, FileText, Shield, ShieldAlert, ShieldCheck, ShieldX, KeyRound } from 'lucide-react';
import { getFbPages, addFbPage, updateFbPage, deleteFbPage, syncFbPage, checkPageToken, checkAllTokens, exchangePageToken } from '../utils/api';
import { usePageContext } from '../contexts/PageContext';
import { useToast } from '../components/Toast';
import './FbPagesPage.css';

const PAGE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

export default function FbPagesPage() {
  const { loadPages: reloadContext } = usePageContext();
  const toast = useToast();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ page_id: '', access_token: '', color: '#6366f1' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [showToken, setShowToken] = useState({});
  const [syncing, setSyncing] = useState({});
  const [checking, setChecking] = useState({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [exchanging, setExchanging] = useState({});
  const [editToken, setEditToken] = useState({});
  const [exchangeInput, setExchangeInput] = useState({});  // {pageId: 'token' | undefined}

  const load = async () => {
    setLoading(true);
    try {
      const res = await getFbPages();
      setPages(res.data.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.page_id.trim() || !addForm.access_token.trim()) {
      setAddError('Vui lòng nhập Page ID và Access Token');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      await addFbPage(addForm);
      setAddForm({ page_id: '', access_token: '', color: '#6366f1' });
      setShowAdd(false);
      load();
      reloadContext();
    } catch (err) {
      setAddError(err.response?.data?.error || err.message);
    }
    setAddLoading(false);
  };

  const handleDelete = async (page) => {
    if (!confirm(`Xoá page "${page.name}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await deleteFbPage(page.id);
      toast.success(`Đã xoá page "${page.name}"`);
      load();
      reloadContext();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const handleToggle = async (page) => {
    try {
      await updateFbPage(page.id, { is_active: !page.is_active });
      toast.info(page.is_active ? `Đã tắt page "${page.name}"` : `Đã bật page "${page.name}"`);
      load();
      reloadContext();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const handleSync = async (page) => {
    setSyncing(v => ({ ...v, [page.id]: true }));
    try {
      await syncFbPage(page.id);
      toast.success(`Đồng bộ "${page.name}" thành công`);
      load();
    } catch (err) {
      toast.error(`Đồng bộ lỗi: ${err.response?.data?.error || err.message}`);
    }
    setSyncing(v => ({ ...v, [page.id]: false }));
  };

  const handleCheckToken = async (page) => {
    setChecking(v => ({ ...v, [page.id]: true }));
    try {
      const res = await checkPageToken(page.id);
      const status = res.data.data.token_status;
      if (status === 'valid') {
        toast.success(`Token "${page.name}" hợp lệ`);
      } else {
        toast.error(`Token "${page.name}" lỗi: ${res.data.data.error || status}`);
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
    setChecking(v => ({ ...v, [page.id]: false }));
  };

  const handleCheckAllTokens = async () => {
    setCheckingAll(true);
    try {
      const res = await checkAllTokens();
      const results = res.data.data;
      const valid = results.filter(r => r.token_status === 'valid').length;
      const invalid = results.length - valid;
      if (invalid === 0) toast.success(`Tất cả ${valid} token đều hợp lệ`);
      else toast.warning(`${valid} hợp lệ, ${invalid} lỗi — cần cập nhật token`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
    setCheckingAll(false);
  };

  const handleExchangeToken = async (page) => {
    const newToken = exchangeInput[page.id]?.trim();
    if (!newToken) {
      toast.warning('Vui lòng paste token mới vào ô bên dưới trước khi đổi');
      // Auto-show input
      setExchangeInput(v => ({...v, [page.id]: v[page.id] !== undefined ? v[page.id] : ''}));
      return;
    }
    setExchanging(v => ({ ...v, [page.id]: true }));
    try {
      const res = await exchangePageToken(page.id, newToken);
      toast.success(res.data.message || 'Đã đổi token dài hạn!');
      setExchangeInput(v => ({...v, [page.id]: undefined}));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
    setExchanging(v => ({ ...v, [page.id]: false }));
  };

  const handleUpdateToken = async (page) => {
    const newToken = editToken[page.id];
    if (!newToken || !newToken.trim()) return toast.warning('Vui lòng nhập token mới');
    try {
      await updateFbPage(page.id, { access_token: newToken.trim() });
      toast.success(`Đã cập nhật token cho "${page.name}"`);
      setEditToken(v => ({ ...v, [page.id]: undefined }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="fbpages-page animate-in">
      <div className="page-header">
        <div>
          <h1>Quản lý Facebook Pages</h1>
          <p className="page-subtitle">{pages.length} page đã kết nối</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <PlusCircle size={16} /> Thêm Page
        </button>
        {pages.length > 0 && (
          <button className="btn btn-secondary" onClick={handleCheckAllTokens} disabled={checkingAll} style={{ marginLeft: 8 }}>
            {checkingAll ? <><Loader size={14} className="spin-icon" /> Đang kiểm tra...</> : <><Shield size={14} /> Kiểm tra Token</>}
          </button>
        )}
      </div>

      {/* Add Page Form */}
      {showAdd && (
        <div className="card add-page-card">
          <h3><Globe size={18} /> Thêm Facebook Page mới</h3>
          <p className="add-page-hint">
            Nhập Page ID và Access Token. Hệ thống sẽ tự động xác minh với Facebook.
          </p>
          <form onSubmit={handleAdd}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Facebook Page ID</label>
                <input
                  value={addForm.page_id}
                  onChange={e => setAddForm(f => ({ ...f, page_id: e.target.value }))}
                  placeholder="VD: 123456789012345"
                />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Page Access Token</label>
                <div className="input-with-icon">
                  <input
                    type={showToken.add ? 'text' : 'password'}
                    value={addForm.access_token}
                    onChange={e => setAddForm(f => ({ ...f, access_token: e.target.value }))}
                    placeholder="Dán Access Token từ Facebook Developer..."
                  />
                  <button type="button" className="input-icon-btn" onClick={() => setShowToken(v => ({ ...v, add: !v.add }))}>
                    {showToken.add ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>Màu nhận diện</label>
              <div className="color-picker">
                {PAGE_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`color-dot ${addForm.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setAddForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>
            {addError && <div className="login-error">{addError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={addLoading}>
                {addLoading ? <><Loader size={14} className="spin-icon" /> Đang xác minh...</> : <><CheckCircle size={14} /> Xác minh & Thêm</>}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowAdd(false); setAddError(''); }}>Huỷ</button>
            </div>
          </form>
        </div>
      )}

      {/* Pages List */}
      {loading ? (
        <div className="page-loading"><div className="loading-spinner" style={{ width: 32, height: 32 }}></div></div>
      ) : pages.length === 0 ? (
        <div className="card empty-state" style={{ padding: 48 }}>
          <Globe size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <p>Chưa có page nào được kết nối</p>
          <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Thêm Facebook Page để bắt đầu tạo và đăng bài tự động
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <PlusCircle size={14} /> Thêm Page đầu tiên
          </button>
        </div>
      ) : (
        <div className="pages-grid">
          {pages.map(page => (
            <div key={page.id} className={`card page-card ${!page.is_active ? 'inactive' : ''}`}>
              <div className="page-card-header" style={{ '--pc': page.color }}>
                <div className="page-card-avatar" style={{ borderColor: page.color }}>
                  {page.avatar_url ? <img src={page.avatar_url} alt="" /> : <span style={{ color: page.color }}>{page.name.charAt(0)}</span>}
                </div>
                <div className="page-card-info">
                  <h3>{page.name}</h3>
                  <span className="page-card-id">ID: {page.page_id}</span>
                </div>
                <button
                  className="page-toggle-btn"
                  onClick={() => handleToggle(page)}
                  title={page.is_active ? 'Tắt page' : 'Bật page'}
                >
                  {page.is_active ? <ToggleRight size={24} color="var(--success)" /> : <ToggleLeft size={24} color="var(--text-muted)" />}
                </button>
              </div>

              <div className="page-card-stats">
                <div className="page-stat">
                  <Users size={14} />
                  <span>{(page.fan_count || 0).toLocaleString('vi-VN')} followers</span>
                </div>
                <div className="page-stat">
                  <FileText size={14} />
                  <span>{page.post_count || 0} bài viết</span>
                </div>
                <div className="page-stat">
                  {page.token_status === 'valid' ? <ShieldCheck size={14} color="var(--success)" /> :
                   page.token_status === 'expired' ? <ShieldX size={14} color="var(--error)" /> :
                   page.token_status === 'error' ? <ShieldAlert size={14} color="var(--warning)" /> :
                   <Shield size={14} color="var(--text-muted)" />}
                  <span className={`token-badge token-${page.token_status || 'unknown'}`}>
                    {page.token_status === 'valid' ? 'Token OK' :
                     page.token_status === 'expired' ? 'Hết hạn' :
                     page.token_status === 'error' ? 'Lỗi' : 'Chưa kiểm tra'}
                  </span>
                </div>
              </div>

              <div className="page-card-token">
                <span className="token-label">Token:</span>
                <span className="token-value">{page.access_token_masked || '••••••••'}</span>
                <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px',fontSize:'.72rem'}} onClick={() => setEditToken(v => ({...v, [page.id]: v[page.id] !== undefined ? undefined : ''}))}>
                  <Edit size={11} /> {editToken[page.id] !== undefined ? 'Hủy' : 'Sửa'}
                </button>
              </div>
              {editToken[page.id] !== undefined && (
                <div className="page-card-token-edit">
                  <input
                    type="text"
                    placeholder="Paste token mới vào đây..."
                    value={editToken[page.id] || ''}
                    onChange={e => setEditToken(v => ({...v, [page.id]: e.target.value}))}
                    style={{fontSize:'.8rem',padding:'6px 10px'}}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => handleUpdateToken(page)} style={{whiteSpace:'nowrap'}}>
                    <CheckCircle size={13} /> Cập nhật
                  </button>
                </div>
              )}

              <div className="page-card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => handleSync(page)} disabled={syncing[page.id]} title="Đồng bộ thông tin từ Facebook">
                  {syncing[page.id] ? <Loader size={13} className="spin-icon" /> : <RefreshCw size={13} />} Đồng bộ
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleCheckToken(page)} disabled={checking[page.id]} title="Kiểm tra token hợp lệ">
                  {checking[page.id] ? <Loader size={13} className="spin-icon" /> : <Shield size={13} />} Check
                </button>
                <button className="btn btn-ghost btn-sm btn-exchange" onClick={() => setExchangeInput(v => ({...v, [page.id]: v[page.id] !== undefined ? undefined : ''}))} title="Đổi sang token dài hạn (~60 ngày)">
                  <KeyRound size={13} /> {exchangeInput[page.id] !== undefined ? 'Hủy' : 'Token dài hạn'}
                </button>
                <button className="btn btn-ghost btn-sm btn-danger" onClick={() => handleDelete(page)}>
                  <Trash2 size={13} /> Xoá
                </button>
              </div>
              {exchangeInput[page.id] !== undefined && (
                <div className="page-card-exchange">
                  <p className="exchange-hint">
                    1. Vào <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Graph API Explorer</a> → Chọn đúng App của bạn<br/>
                    2. Tạo User Access Token với quyền <code>pages_manage_posts</code>, <code>pages_read_engagement</code><br/>
                    3. Paste token vào ô bên dưới và bấm "Đổi token dài hạn"
                  </p>
                  <div className="page-card-token-edit">
                    <input
                      type="text"
                      placeholder="Paste User Access Token mới từ Graph API Explorer..."
                      value={exchangeInput[page.id] || ''}
                      onChange={e => setExchangeInput(v => ({...v, [page.id]: e.target.value}))}
                      style={{fontSize:'.8rem',padding:'6px 10px'}}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => handleExchangeToken(page)} disabled={exchanging[page.id]} style={{whiteSpace:'nowrap'}}>
                      {exchanging[page.id] ? <Loader size={13} className="spin-icon" /> : <KeyRound size={13} />} Đổi token dài hạn
                    </button>
                  </div>
                </div>
              )}

              {page.last_synced && (
                <div className="page-card-footer">
                  Đồng bộ lần cuối: {new Date(page.last_synced).toLocaleString('vi-VN')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

