import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Play, RefreshCw, Eye, Check, X, Clock, Loader2, Sparkles, AlertCircle, Lightbulb, Plus, Trash2, StopCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import {
  createStoryJob, getStoryJobs, getGeneratedPosts, approveGeneratedPost, publishGeneratedPost,
  getTopicSuggestions, generateTopicSuggestions, pickTopicSuggestion, dismissTopicSuggestion,
  retryStoryJob, cancelStoryJob, deleteStoryJob, deleteGeneratedPost,
} from '../utils/api';
import './AutoContentPage.css';

const STEP_LABELS = ['Tìm câu chuyện', 'Tìm ảnh', 'Viết bài', 'Tạo ảnh', 'Hoàn tất'];

export default function AutoContentPage() {
  const [jobs, setJobs] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [pickingId, setPickingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const jobsSectionRef = useRef(null);

  const scrollToJobs = () => {
    setTimeout(() => {
      jobsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  };

  const load = useCallback(async () => {
    try {
      const [jobsRes, draftsRes, sugRes] = await Promise.all([
        getStoryJobs({ limit: 10 }),
        getGeneratedPosts({ status: 'draft', limit: 20 }),
        getTopicSuggestions({ status: 'pending', limit: 100 }),
      ]);
      setJobs(jobsRes.data.jobs || []);
      setDrafts(draftsRes.data.posts || []);
      setSuggestions(sugRes.data.suggestions || []);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while jobs are running
  useEffect(() => {
    const hasRunning = jobs.some(j => !['completed', 'failed'].includes(j.status));
    if (!hasRunning) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [jobs, load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createStoryJob({ topic: topic || null });
      addToast('Đã thêm vào hàng đợi', 'info');
      setTopic('');
      setTimeout(load, 2000);
      scrollToJobs();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi tạo job', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleQuickApprove = async (id) => {
    try {
      await approveGeneratedPost(id);
      addToast('Đã duyệt bài!', 'success');
      load();
    } catch (err) {
      addToast('Lỗi duyệt bài', 'error');
    }
  };

  const handleQuickPublish = async (id) => {
    try {
      await publishGeneratedPost(id);
      addToast('Đã đăng bài lên Facebook!', 'success');
      load();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi publish', 'error');
    }
  };

  const handleGenerateBatch = async () => {
    setGeneratingBatch(true);
    try {
      const res = await generateTopicSuggestions();
      const n = res.data.suggestions?.length || 0;
      addToast(`Đã tạo ${n} gợi ý mới!`, 'success');
      load();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi tạo gợi ý', 'error');
    } finally {
      setGeneratingBatch(false);
    }
  };

  const handlePickSuggestion = async (id) => {
    setPickingId(id);
    try {
      await pickTopicSuggestion(id);
      addToast('Đã thêm vào hàng đợi', 'info');
      load();
      scrollToJobs();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi pick gợi ý', 'error');
    } finally {
      setPickingId(null);
    }
  };

  const handleDismissSuggestion = async (id) => {
    try {
      await dismissTopicSuggestion(id);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      addToast('Lỗi bỏ qua gợi ý', 'error');
    }
  };

  const handleRetryJob = async (jobId) => {
    try {
      await retryStoryJob(jobId);
      addToast('Đang chạy lại job...', 'info');
      load();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi retry', 'error');
    }
  };

  const handleCancelJob = async (jobId) => {
    if (!confirm('Huỷ job này? Pipeline sẽ dừng ở step kế tiếp.')) return;
    try {
      await cancelStoryJob(jobId);
      addToast('Đã huỷ job', 'info');
      load();
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi huỷ job', 'error');
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!confirm('Xoá job này khỏi danh sách? Bản nháp đã tạo (nếu có) vẫn còn.')) return;
    try {
      await deleteStoryJob(jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      addToast('Đã xoá job', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi xoá job', 'error');
    }
  };

  // "Đã chạy 3 phút trước" / "vừa xong"
  const formatElapsed = (startedAt) => {
    if (!startedAt) return '';
    const ms = Date.now() - new Date(startedAt).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}p`;
    const h = Math.floor(min / 60);
    return `${h}h${min % 60}p`;
  };

  const handleDeleteDraft = async (id, title) => {
    if (!confirm(`Xoá bản nháp "${title}"?\nThao tác không thể hoàn tác.`)) return;
    try {
      await deleteGeneratedPost(id);
      setDrafts(prev => prev.filter(d => d.id !== id));
      addToast('Đã xoá bản nháp', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Lỗi xoá bản nháp', 'error');
    }
  };

  // Group suggestions by batch_id (newest batch first)
  const suggestionBatches = (() => {
    const map = new Map();
    for (const s of suggestions) {
      const key = s.batch_id || `single-${s.id}`;
      if (!map.has(key)) {
        map.set(key, { batch_id: s.batch_id, source: s.source, created_at: s.created_at, items: [] });
      }
      map.get(key).items.push(s);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  })();

  const pendingDrafts = drafts.filter(d => d.status === 'draft');
  const runningJobs = jobs.filter(j => !['completed', 'failed', 'cancelled'].includes(j.status));
  const cancelledJobs = jobs.filter(j => j.status === 'cancelled');

  if (loading) return <div className="auto-content-page"><div className="loading-spinner" style={{ width: 32, height: 32 }} /></div>;

  return (
    <div className="auto-content-page">
      <div className="page-header">
        <div>
          <h1><Bot size={28} /> Auto Content</h1>
          <p className="subtitle">Hệ thống tự động tạo bài từ câu chuyện có thật</p>
        </div>
        <button className="btn-refresh" onClick={load}><RefreshCw size={16} /> Làm mới</button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card draft">
          <div className="stat-number">{pendingDrafts.length}</div>
          <div className="stat-label">Chờ duyệt</div>
        </div>
        <div className="stat-card running">
          <div className="stat-number">{runningJobs.length}</div>
          <div className="stat-label">Đang chạy</div>
        </div>
        <div className="stat-card total">
          <div className="stat-number">{drafts.length}</div>
          <div className="stat-label">Tổng nháp</div>
        </div>
      </div>

      {/* Create Manual */}
      <div className="create-section">
        <h2><Sparkles size={20} /> Tạo bài thủ công</h2>
        <div className="create-form">
          <input
            type="text"
            placeholder="Nhập chủ đề (VD: Chú chó Hachiko) hoặc để trống cho AI tự chọn..."
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
          />
          <button onClick={handleCreate} disabled={creating} className="btn-create">
            {creating ? <><Loader2 size={16} className="spin" /> Đang tạo...</> : <><Play size={16} /> Tạo bài</>}
          </button>
        </div>
      </div>

      {/* Topic Suggestions */}
      <div className="section suggestions-section">
        <div className="section-header">
          <h2><Lightbulb size={20} /> Gợi ý chủ đề ({suggestions.length})</h2>
          <button
            className="btn-generate-batch"
            onClick={handleGenerateBatch}
            disabled={generatingBatch}
          >
            {generatingBatch
              ? <><Loader2 size={16} className="spin" /> Đang tạo...</>
              : <><Plus size={16} /> Tạo thêm gợi ý</>}
          </button>
        </div>

        {suggestionBatches.length === 0 ? (
          <div className="empty-state">
            <Lightbulb size={48} />
            <p>Chưa có gợi ý nào. Bấm <b>"Tạo thêm gợi ý"</b> hoặc đợi cron 06:00 hàng ngày.</p>
          </div>
        ) : (
          <div className="batches-list">
            {suggestionBatches.map((batch) => (
              <div key={batch.batch_id || batch.items[0].id} className="batch-group">
                <div className="batch-meta">
                  <span className={`batch-source source-${batch.source}`}>
                    {batch.source === 'cron' ? '⏰ Hàng ngày' : '✨ Thủ công'}
                  </span>
                  <span className="batch-time">
                    {new Date(batch.created_at).toLocaleString('vi-VN')}
                  </span>
                  <span className="batch-count">{batch.items.length} chủ đề</span>
                </div>
                <div className="suggestions-grid">
                  {batch.items.map((s) => (
                    <div key={s.id} className="suggestion-card">
                      <div className="suggestion-header">
                        <span className="suggestion-category">{s.category || 'misc'}</span>
                        <button
                          className="btn-icon-dismiss"
                          title="Bỏ qua"
                          onClick={() => handleDismissSuggestion(s.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <h3 className="suggestion-title">{s.title_vi || s.title}</h3>
                      {s.title_vi && s.title && s.title_vi !== s.title && (
                        <p className="suggestion-original">{s.title}</p>
                      )}
                      {s.summary && <p className="suggestion-summary">{s.summary}</p>}
                      <div className="suggestion-actions">
                        <button
                          className="btn-pick"
                          onClick={() => handlePickSuggestion(s.id)}
                          disabled={pickingId === s.id}
                        >
                          {pickingId === s.id
                            ? <><Loader2 size={14} className="spin" /> Đang khởi chạy...</>
                            : <><Play size={14} /> Tạo bài</>}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled / Running Jobs */}
      {runningJobs.length > 0 && (
        <div className="section" ref={jobsSectionRef}>
          <h2><Clock size={20} /> Jobs đã lên lịch ({runningJobs.length})</h2>
          <div className="jobs-list">
            {runningJobs.map(job => (
              <div key={job.id} className="job-card running">
                <div className="job-header">
                  <div className="job-topic-block">
                    <span className="job-topic">{job.topic}</span>
                    {job.story?.title_vi && job.story.title_vi !== job.topic && (
                      <span className="job-story-resolved">
                        → <strong>{job.story.title_vi}</strong>
                      </span>
                    )}
                  </div>
                  <div className="job-header-right">
                    {job.started_at && (
                      <span className="job-elapsed" title="Đã chạy">
                        <Clock size={12} /> {formatElapsed(job.started_at)}
                      </span>
                    )}
                    <span className={`job-status status-${job.status}`}>{job.status}</span>
                    <button
                      className="btn-icon-job btn-cancel-job"
                      onClick={() => handleCancelJob(job.id)}
                      title="Huỷ job"
                    >
                      <StopCircle size={14} />
                    </button>
                    <button
                      className="btn-icon-job btn-delete-job"
                      onClick={() => handleDeleteJob(job.id)}
                      title="Xoá job khỏi danh sách"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="pipeline-progress">
                  {STEP_LABELS.map((label, i) => (
                    <div key={i} className={`step ${i < job.current_step ? 'done' : i === job.current_step ? 'active' : ''}`}>
                      <div className="step-dot">{i < job.current_step ? '✓' : i + 1}</div>
                      <span className="step-label">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drafts */}
      <div className="section">
        <h2><Eye size={20} /> Bản nháp chờ duyệt ({pendingDrafts.length})</h2>
        {pendingDrafts.length === 0 ? (
          <div className="empty-state">
            <Bot size={48} />
            <p>Chưa có bản nháp nào. Tạo bài mới hoặc bật tự động trong Cài đặt!</p>
          </div>
        ) : (
          <div className="drafts-grid">
            {pendingDrafts.map(draft => (
              <div key={draft.id} className="draft-card">
                {draft.finalImage && (
                  <div className="draft-image">
                    <img src={draft.finalImage.thumbnail_path || draft.finalImage.path} alt="" />
                  </div>
                )}
                <div className="draft-content">
                  <div className="draft-meta">
                    <span className="draft-category">{draft.story?.category || 'Chưa phân loại'}</span>
                    {draft.fbPage && <span className="draft-page">{draft.fbPage.name}</span>}
                  </div>
                  {draft.contentJob?.topic && draft.story?.title_vi && draft.contentJob.topic !== draft.story.title_vi && (
                    <div className="draft-topic-trace">
                      Yêu cầu: <em>{draft.contentJob.topic}</em>
                    </div>
                  )}
                  <h3 className="draft-hook">{draft.hook || draft.story?.title_vi}</h3>
                  <p className="draft-preview">{(draft.post_body || '').substring(0, 120)}...</p>
                  <div className="draft-actions">
                    <button className="btn-sm btn-review" onClick={() => navigate(`/review/${draft.id}`)}>
                      <Eye size={14} /> Xem
                    </button>
                    <button className="btn-sm btn-approve" onClick={() => handleQuickApprove(draft.id)}>
                      <Check size={14} /> Duyệt
                    </button>
                    <button className="btn-sm btn-publish" onClick={() => handleQuickPublish(draft.id)}>
                      <Sparkles size={14} /> Publish
                    </button>
                    <button
                      className="btn-sm btn-delete"
                      onClick={() => handleDeleteDraft(draft.id, draft.hook || draft.story?.title_vi || 'Bản nháp')}
                      title="Xoá bản nháp"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Failed / Cancelled Jobs */}
      {(jobs.filter(j => j.status === 'failed').length + cancelledJobs.length) > 0 && (
        <div className="section">
          <h2><AlertCircle size={20} /> Jobs lỗi / đã huỷ</h2>
          <div className="jobs-list">
            {[...jobs.filter(j => j.status === 'failed'), ...cancelledJobs].slice(0, 8).map(job => (
              <div key={job.id} className={`job-card ${job.status === 'cancelled' ? 'cancelled' : 'failed'}`}>
                <div className="job-header">
                  <span className="job-topic">{job.topic}</span>
                  <div className="job-header-right">
                    <button className="btn-retry" onClick={() => handleRetryJob(job.id)} title="Chạy lại">
                      <RefreshCw size={14} /> Retry
                    </button>
                    <button
                      className="btn-icon-job btn-delete-job"
                      onClick={() => handleDeleteJob(job.id)}
                      title="Xoá khỏi danh sách"
                    >
                      <Trash2 size={14} />
                    </button>
                    <span className={`job-status status-${job.status}`}>
                      {job.status === 'cancelled' ? 'Đã huỷ' : 'Lỗi'}
                    </span>
                  </div>
                </div>
                {job.error_message && <p className="job-error">{job.error_message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
