import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, RefreshCw, Send, ExternalLink, Edit3, Save, Trash2, Upload, Wand2 } from 'lucide-react';
import { useToast } from '../components/Toast';
import { getGeneratedPost, updateGeneratedPost, approveGeneratedPost, rejectGeneratedPost, publishGeneratedPost, regeneratePost, getFbPages, deleteGeneratedPost, redesignGeneratedPost } from '../utils/api';
import './StoryReviewPage.css';

export default function StoryReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [post, setPost] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [redesigning, setRedesigning] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadPost();
    getFbPages().then(r => setPages(r.data?.data || [])).catch(() => {});
  }, [id]);

  const loadPost = async () => {
    try {
      const res = await getGeneratedPost(id);
      setPost(res.data);
      setEditBody(res.data.post_body || '');
    } catch (err) {
      addToast('Không tìm thấy bài viết', 'error');
      navigate('/auto-content');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      await updateGeneratedPost(id, { post_body: editBody });
      addToast('Đã lưu!', 'success');
      setEditing(false);
      loadPost();
    } catch (err) {
      addToast('Lỗi lưu', 'error');
    }
  };

  const handleApprove = async () => {
    try {
      await approveGeneratedPost(id);
      addToast('Đã duyệt bài!', 'success');
      loadPost();
    } catch { addToast('Lỗi', 'error'); }
  };

  const handleReject = async () => {
    try {
      await rejectGeneratedPost(id);
      addToast('Đã từ chối bài', 'info');
      loadPost();
    } catch { addToast('Lỗi', 'error'); }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await publishGeneratedPost(id);
      addToast('Đã đăng lên Facebook!', 'success');
      loadPost();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi publish', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regeneratePost(id);
      addToast('Đã tạo lại bài viết!', 'success');
      loadPost();
    } catch (err) {
      addToast('Lỗi tạo lại', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Xoá bản nháp này? Thao tác không thể hoàn tác.')) return;
    try {
      await deleteGeneratedPost(id);
      addToast('Đã xoá bản nháp', 'success');
      navigate('/auto-content');
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi xoá', 'error');
    }
  };

  const runRedesign = async (options) => {
    setRedesigning(true);
    try {
      await redesignGeneratedPost(id, options);
      addToast('Đã tạo lại ảnh!', 'success');
      loadPost();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi tạo lại ảnh', 'error');
    } finally {
      setRedesigning(false);
    }
  };

  const handleRedesignFromCurrent = () => runRedesign({ useCurrent: true });
  const handleRedesignFromScratch = () => runRedesign({});

  const handleUploadReference = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await runRedesign({ file });
  };

  const triggerUpload = () => fileInputRef.current?.click();

  const handlePageChange = async (pageId) => {
    try {
      await updateGeneratedPost(id, { fb_page_id: parseInt(pageId) });
      loadPost();
    } catch { addToast('Lỗi', 'error'); }
  };

  if (loading) return <div className="review-page"><div className="loading-spinner" style={{ width: 32, height: 32 }} /></div>;
  if (!post) return null;

  const story = post.story;
  const fbPage = post.fbPage;

  // Sequelize JSON fields đôi khi trả về string (khi underlying column là LONGTEXT) — parse phòng thủ
  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  };
  const verifiedFacts = toArray(story?.verified_facts);
  const sourceUrls = toArray(story?.source_urls);

  return (
    <div className="review-page">
      <div className="review-header">
        <button className="btn-back" onClick={() => navigate('/auto-content')}>
          <ArrowLeft size={18} /> Quay lại
        </button>
        <div className="review-actions">
          <span className={`status-badge status-${post.status}`}>{post.status}</span>
          {post.status === 'draft' && (
            <>
              <button className="btn-action btn-approve-lg" onClick={handleApprove}><Check size={16} /> Duyệt</button>
              <button className="btn-action btn-reject-lg" onClick={handleReject}><X size={16} /> Từ chối</button>
            </>
          )}
          {(post.status === 'draft' || post.status === 'approved') && (
            <button className="btn-action btn-publish-lg" onClick={handlePublish} disabled={publishing}>
              <Send size={16} /> {publishing ? 'Đang đăng...' : 'Publish'}
            </button>
          )}
          <button className="btn-action btn-delete-lg" onClick={handleDelete} title="Xoá bản nháp">
            <Trash2 size={16} /> Xoá
          </button>
        </div>
      </div>

      <div className="review-layout">
        {/* Left: Preview */}
        <div className="preview-col">
          <div className="fb-preview-card">
            <div className="fb-header">
              {fbPage?.avatar_url && <img src={fbPage.avatar_url} alt="" className="fb-avatar" />}
              <div>
                <div className="fb-page-name">{fbPage?.name || 'Facebook Page'}</div>
                <div className="fb-time">Vừa xong · 🌐</div>
              </div>
            </div>
            <div className="fb-body">
              {editing ? (
                <div className="edit-area">
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={12} />
                  <div className="edit-buttons">
                    <button onClick={handleSaveEdit} className="btn-save"><Save size={14} /> Lưu</button>
                    <button onClick={() => { setEditing(false); setEditBody(post.post_body); }} className="btn-cancel-edit">Hủy</button>
                  </div>
                </div>
              ) : (
                <div className="fb-text" onClick={() => setEditing(true)}>
                  {post.post_body?.split('\n').map((line, i) => <p key={i}>{line || <br />}</p>)}
                  <button className="btn-edit-inline"><Edit3 size={12} /> Sửa</button>
                </div>
              )}
            </div>
            {post.finalImage && (
              <div className="fb-image">
                <img src={post.finalImage.path} alt="" />
              </div>
            )}
          </div>
          {post.finalImage && (() => {
            const isAIOnly = (post.finalImage.license_type || '').startsWith('AI Designed') &&
                             !(post.finalImage.attribution_text || '').includes('from reference');
            const isAIWithRef = (post.finalImage.license_type || '').startsWith('AI Designed') &&
                                (post.finalImage.attribution_text || '').includes('from reference');
            return (
              <div className={`image-source-info ${isAIOnly ? 'is-ai-only' : ''}`}>
                {isAIOnly && (
                  <div className="image-warning-badge">
                    ⚠️ Ảnh AI tạo từ scratch — không có ảnh thật tham chiếu. Cân nhắc upload ảnh thật để AI thiết kế lại.
                  </div>
                )}
                {isAIWithRef && (
                  <div className="image-info-badge">
                    ✨ AI thiết kế từ ảnh tham chiếu thật
                  </div>
                )}
                <div className="image-source-label">
                  <strong>Nguồn ảnh:</strong> {post.finalImage.license_type || 'Unknown'}
                  {post.finalImage.author && post.finalImage.author !== 'Unknown' && ` · ${post.finalImage.author}`}
                </div>
                {post.finalImage.source_url && (
                  <a href={post.finalImage.source_url} target="_blank" rel="noopener noreferrer" className="source-link">
                    <ExternalLink size={12} />{' '}
                    {post.finalImage.source_url.length > 60
                      ? post.finalImage.source_url.substring(0, 60) + '...'
                      : post.finalImage.source_url}
                  </a>
                )}
                {post.finalImage.attribution_text && (
                  <div className="image-attribution">{post.finalImage.attribution_text}</div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Right: Details */}
        <div className="detail-col">
          {/* Story Info */}
          <div className="detail-card">
            <h3>Câu chuyện</h3>
            <div className="detail-row">
              <label>Tên:</label>
              <span>{story?.title_vi || story?.title}</span>
            </div>
            {story?.event_date && <div className="detail-row"><label>Thời gian:</label><span>{story.event_date}</span></div>}
            {story?.location && <div className="detail-row"><label>Địa điểm:</label><span>{story.location}</span></div>}
            {story?.category && <div className="detail-row"><label>Thể loại:</label><span className="category-tag">{story.category}</span></div>}
          </div>

          {/* Verified Facts */}
          {verifiedFacts.length > 0 && (
            <div className="detail-card">
              <h3>Dữ kiện đã xác minh</h3>
              <ul className="facts-list">
                {verifiedFacts.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          {/* Sources */}
          {sourceUrls.length > 0 && (
            <div className="detail-card">
              <h3>Nguồn tham khảo</h3>
              {sourceUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="source-link">
                  <ExternalLink size={12} /> {url.length > 60 ? url.substring(0, 60) + '...' : url}
                </a>
              ))}
            </div>
          )}

          {/* Page Selection */}
          <div className="detail-card">
            <h3>Facebook Page</h3>
            <select value={post.fb_page_id || ''} onChange={e => handlePageChange(e.target.value)}>
              <option value="">Chọn Page...</option>
              {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Quick Actions */}
          <div className="detail-card">
            <h3>Hành động</h3>
            <button className="btn-action-full" onClick={handleRegenerate} disabled={regenerating || redesigning}>
              <RefreshCw size={14} className={regenerating ? 'spin' : ''} />
              {regenerating ? 'Đang tạo lại...' : 'AI viết lại bài'}
            </button>
          </div>

          {/* Redesign Image */}
          <div className="detail-card">
            <h3><Wand2 size={16} /> Thiết kế lại ảnh</h3>
            <p className="hint-text">
              <strong>Upload ảnh thật:</strong> giữ NGUYÊN 100% ảnh, chỉ đè text + badge lên (Sharp, &lt; 1s).<br/>
              <strong>Tạo ảnh AI:</strong> gpt-image-2 sinh ảnh mới từ chủ đề (~30-90s, ~$0.04).
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleUploadReference}
            />
            <button className="btn-action-full" onClick={triggerUpload} disabled={redesigning}>
              <Upload size={14} className={redesigning ? 'spin' : ''} />
              {redesigning ? 'Đang xử lý...' : 'Upload ảnh thật → giữ nguyên + đè text'}
            </button>
            {post.finalImage && (
              <button className="btn-action-full btn-secondary-action" onClick={handleRedesignFromCurrent} disabled={redesigning}>
                <Wand2 size={14} className={redesigning ? 'spin' : ''} />
                Đè lại text lên ảnh hiện tại
              </button>
            )}
            <button className="btn-action-full btn-secondary-action" onClick={handleRedesignFromScratch} disabled={redesigning}>
              <RefreshCw size={14} className={redesigning ? 'spin' : ''} />
              AI tạo ảnh mới (không reference)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
