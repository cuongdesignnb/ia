/**
 * Create True Story Post — luồng AI tự tìm câu chuyện CÓ THẬT trên internet.
 *
 * 6 bước:
 *   1. Nhập chủ đề
 *   2. Danh sách câu chuyện (AI tìm + chấm điểm nguồn)
 *   3. Brief
 *   4. Caption
 *   5. Hình ảnh (tab "Ảnh thật" / "Ảnh AI minh hoạ")
 *   6. Preview & Đăng
 *
 * Không có Search API → page hiển thị banner lỗi, KHÔNG cho tạo bài.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Wand2, Loader, ChevronLeft, ChevronRight, FileText, Eye, CalendarClock, Send,
  Clock, AlertTriangle, CheckCircle2, ImagePlus, Camera, Upload, X, ExternalLink, Globe, Info,
  ShieldCheck, ShieldAlert,
} from 'lucide-react';
import {
  getTrueStoryProviders, findTrueStoryIdeasAPI, generateTrueStoryBriefAPI,
  generateTrueStoryCaptionAPI, generateTrueStoryImagePlanAPI,
  autoGenerateTrueStoryAPI,
  getAiProviders, generateImage,
  createPost, publishPost, publishDraft, publishScheduled,
} from '../utils/api';
import { TRUE_STORY_IMAGE_TEMPLATES, buildTrueStoryPrompt } from '../config/trueStoryImageTemplates';
import { usePageContext } from '../contexts/PageContext';
import { useToast } from '../components/Toast';
import './CreateTrueStoryPost.css';

const STEPS = ['Chủ đề', 'Câu chuyện', 'Brief', 'Caption', 'Hình ảnh', 'Đăng'];

const CONTENT_TYPES = [
  { id: 'missing', label: 'Vụ mất tích bí ẩn' },
  { id: 'cold_case', label: 'Kỳ án / chưa có lời giải' },
  { id: 'strange_history', label: 'Lịch sử kỳ lạ' },
  { id: 'discovery', label: 'Khám phá khoa học' },
  { id: 'character', label: 'Nhân vật số phận đặc biệt' },
  { id: 'emotional', label: 'Câu chuyện cảm động' },
  { id: 'weird_world', label: 'Tin lạ thế giới' },
];

const COUNT_OPTIONS = [5, 10, 20];

const initial = {
  topic: '',
  content_type: 'missing',
  country: '',
  language: 'auto',
  count: 5,
};

const VerifBadge = ({ status }) => {
  if (status === 'strong') return <span className="ts-badge ts-badge-strong"><ShieldCheck size={12} /> strong</span>;
  if (status === 'medium') return <span className="ts-badge ts-badge-medium"><ShieldCheck size={12} /> medium</span>;
  return <span className="ts-badge ts-badge-weak"><ShieldAlert size={12} /> weak</span>;
};

export default function CreateTrueStoryPost() {
  const nav = useNavigate();
  const toast = useToast();
  const { activePage, pages } = usePageContext();

  const [providersReady, setProvidersReady] = useState(null); // null=loading
  const [providersDetail, setProvidersDetail] = useState({});

  const [step, setStep] = useState(0);
  const [input, setInput] = useState(initial);

  const [ideas, setIdeas] = useState([]);
  const [searchWarnings, setSearchWarnings] = useState([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState(null);

  const [brief, setBrief] = useState(null);

  const [caption, setCaption] = useState(null);
  const [captionEdit, setCaptionEdit] = useState('');

  const [imagePlan, setImagePlan] = useState(null);
  const [imageMode, setImageMode] = useState('upload_real_image');
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imgModel, setImgModel] = useState('');
  const [aiModels, setAiModels] = useState({ image: [] });
  const [selectedTemplate, setSelectedTemplate] = useState(TRUE_STORY_IMAGE_TEMPLATES[0]?.id);

  const [fbPageId, setFbPageId] = useState(activePage || '');
  const [scheduledAt, setScheduledAt] = useState('');

  const [busy, setBusy] = useState({});

  const setBusyKey = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const update = (p) => setInput((s) => ({ ...s, ...p }));

  // Load providers + AI models
  useEffect(() => {
    getTrueStoryProviders().then((r) => {
      const p = r.data?.data?.providers || {};
      setProvidersDetail(p);
      setProvidersReady(!!p.any);
    }).catch(() => setProvidersReady(false));

    getAiProviders().then((r) => {
      const m = r.data?.data?.models || { image: [] };
      setAiModels(m);
      const gpt2 = m.image?.find((x) => x.id === 'gpt-image-2');
      if (gpt2) setImgModel(gpt2.id);
      else if (m.image?.[0]) setImgModel(m.image[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => { setFbPageId(activePage || ''); }, [activePage]);

  const selectedIdea = useMemo(
    () => ideas.find((i) => i.id === selectedIdeaId),
    [ideas, selectedIdeaId]
  );

  /* ============= ACTIONS ============= */

  // AUTO MODE — 1 nút, không cần nhập gì, chạy full pipeline rồi nhảy thẳng đến preview
  const runAuto = async () => {
    setBusyKey('auto', true);
    try {
      const res = await autoGenerateTrueStoryAPI({
        content_type: input.content_type || undefined,
        country: input.country || undefined,
        language: input.language,
      });
      const d = res.data.data;

      // Populate toàn bộ state như đã chạy từng bước
      setIdeas(d.ideas || []);
      setSelectedIdeaId(d.selected_idea?.id);
      setBrief(d.brief);
      const cap = d.caption;
      setCaption(cap);
      setCaptionEdit(cap?.caption || '');
      const plan = d.image_plan;
      setImagePlan(plan);
      setImageMode(plan?.recommended_mode || 'ai_illustration');
      setImagePrompt(plan?.ai_image_prompt || '');
      setSearchWarnings(d.warnings || []);

      // Cho UI biết auto đã pick chủ đề gì
      if (d.auto_picked_topic) {
        toast.info(`Auto đã chọn chủ đề: "${d.auto_picked_topic}"`);
        update({ topic: d.auto_picked_topic });
      }

      // Nhảy thẳng đến step Hình ảnh để user xác nhận / tạo ảnh, rồi đăng
      setStep(4);
    } catch (e) {
      toast.error('Auto thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyKey('auto', false);
    }
  };

  const runFindIdeas = async () => {
    if (!input.topic.trim()) return toast.warning('Nhập chủ đề trước');
    setBusyKey('ideas', true);
    try {
      const res = await findTrueStoryIdeasAPI(input);
      const data = res.data.data;
      setIdeas(data.ideas || []);
      setSearchWarnings(data.warnings || []);
      if (!data.ideas?.length) toast.warning('Không tìm thấy câu chuyện nào phù hợp');
      setStep(1);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      toast.error('Lỗi: ' + msg);
    } finally {
      setBusyKey('ideas', false);
    }
  };

  const runBrief = async (idea) => {
    setBusyKey('brief', true);
    try {
      const res = await generateTrueStoryBriefAPI({
        selected_idea: idea,
        sources: idea.sources,
      });
      setBrief(res.data.data);
      setStep(2);
    } catch (e) {
      toast.error('Lỗi brief: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyKey('brief', false);
    }
  };

  const runCaption = async (regen_hint) => {
    if (!brief) return;
    setBusyKey('caption', true);
    try {
      const res = await generateTrueStoryCaptionAPI({
        brief,
        selected_angle: {
          title: selectedIdea?.title,
          hook: selectedIdea?.suggested_hook,
          emotional_trigger: selectedIdea?.emotional_angle,
        },
        regen_hint,
      });
      const c = res.data.data;
      setCaption(c);
      setCaptionEdit(c.caption);
    } catch (e) {
      toast.error('Lỗi caption: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyKey('caption', false);
    }
  };

  const runImagePlan = async () => {
    if (!brief) return;
    setBusyKey('imagePlan', true);
    try {
      const res = await generateTrueStoryImagePlanAPI({
        brief,
        caption_meta: caption ? { thumbnail_text: caption.thumbnail_text, title: caption.title } : {},
      });
      const plan = res.data.data;
      setImagePlan(plan);
      setImageMode(plan.recommended_mode || 'upload_real_image');
      setImagePrompt(plan.ai_image_prompt || buildTrueStoryPrompt(selectedTemplate, { product: input.topic, thumbnail_text: caption?.thumbnail_text }));
    } catch (e) {
      toast.error('Lỗi image plan: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyKey('imagePlan', false);
    }
  };

  const runGenerateImage = async () => {
    setBusyKey('image', true);
    try {
      const finalPrompt = imagePrompt || buildTrueStoryPrompt(selectedTemplate, { product: input.topic, thumbnail_text: caption?.thumbnail_text });
      const res = await generateImage({
        product: input.topic || caption?.title || 'story',
        custom_prompt: finalPrompt,
        prefer_model: imgModel || undefined,
      });
      const d = res.data.data;
      if (d?.url) {
        setImagePreview(d.url);
        setImageFile(null);
        setImageUrl('');
      }
    } catch (e) {
      toast.error('Lỗi tạo ảnh: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyKey('image', false);
    }
  };

  const handleUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
    setImageUrl('');
  };

  const pickSourceImage = (url) => {
    setImageUrl(url);
    setImagePreview(url);
    setImageFile(null);
  };

  const clearImage = () => { setImageFile(null); setImageUrl(''); setImagePreview(''); };

  const handleSave = async (status, action) => {
    if (!caption || !captionEdit) return toast.warning('Cần có caption');
    if (!fbPageId) return toast.warning('Chọn Page để đăng');
    if (selectedIdea?.verification_status === 'weak' && action) {
      const ok = window.confirm('Câu chuyện này chỉ có 1 nguồn hoặc nguồn yếu. Nên kiểm tra thêm trước khi đăng. Tiếp tục?');
      if (!ok) return;
    }
    setBusyKey('save', true);
    try {
      const fd = new FormData();
      fd.append('title', caption.title || selectedIdea?.title || input.topic);
      fd.append('caption', captionEdit);
      fd.append('status', status);
      fd.append('fb_page_id', fbPageId);
      if (scheduledAt) fd.append('scheduled_at', scheduledAt);
      if (imageFile) fd.append('image', imageFile);
      else if (imageUrl) fd.append('image_url', imageUrl);
      else if (imagePreview) fd.append('image_url', imagePreview);

      // Metadata: lưu nguồn + verification để truy ngược về sau
      fd.append('metadata', JSON.stringify({
        true_story: true,
        sources: selectedIdea?.sources || [],
        verification_status: selectedIdea?.verification_status,
        confidence_score: selectedIdea?.confidence_score,
        brief_summary: brief?.summary,
        image_mode: imagePreview ? (imageFile || imageUrl ? 'real_or_url' : 'ai_illustration') : null,
        warnings: [...(searchWarnings || []), ...(selectedIdea?.warning_notes || [])],
      }));

      const res = await createPost(fd);
      const postId = res.data.data.id;
      if (action === 'publish_now') { await publishPost(postId); toast.success('Đã đăng lên Facebook'); }
      else if (action === 'publish_draft') { await publishDraft(postId); toast.success('Đã đăng nháp lên Facebook'); }
      else if (action === 'publish_scheduled' && scheduledAt) { await publishScheduled(postId, scheduledAt); toast.success('Đã hẹn giờ'); }
      else toast.info('Đã lưu nháp');
      nav('/posts');
    } catch (e) {
      toast.error('Lỗi đăng: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusyKey('save', false);
    }
  };

  const selectedPage = pages.find((p) => p.id === parseInt(fbPageId));
  const activePages = pages.filter((p) => p.is_active);

  /* ============= GATE: Search API ============= */
  if (providersReady === null) {
    return <div className="ts-page"><div className="loading-spinner" style={{ width: 32, height: 32 }} /></div>;
  }
  if (!providersReady) {
    return (
      <div className="ts-page animate-in">
        <div className="page-header"><div><h1>Tạo bài chuyện có thật</h1></div></div>
        <div className="card">
          <div className="ts-error-big">
            <AlertTriangle size={32} />
            <h3>Chưa cấu hình Search API</h3>
            <p>Dự án này KHÔNG tạo chuyện bịa. Cần ít nhất 1 trong các provider sau để tìm câu chuyện thật trên internet:</p>
            <ul>
              <li><strong>Tavily</strong> — <code>TAVILY_API_KEY</code> (khuyến nghị)</li>
              <li><strong>SerpAPI</strong> — <code>SERPAPI_API_KEY</code></li>
              <li><strong>Google Custom Search</strong> — <code>GOOGLE_SEARCH_API_KEY</code> + <code>GOOGLE_SEARCH_CX</code></li>
              <li><strong>Bing Search</strong> — <code>BING_SEARCH_API_KEY</code></li>
            </ul>
            <p className="ts-tip">Thêm key vào <code>.env</code> hoặc trong trang <a href="/settings">Cài đặt</a> rồi tải lại.</p>
          </div>
        </div>
      </div>
    );
  }

  /* ============= RENDER ============= */
  return (
    <div className="ts-page animate-in">
      <div className="page-header">
        <div>
          <h1>Tạo bài chuyện có thật</h1>
          <p className="page-subtitle">AI tự tìm câu chuyện có thật trên internet — không bịa, có nguồn rõ ràng</p>
        </div>
      </div>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} onClick={() => setStep(i)}>{s}</div>
        ))}
      </div>

      {/* AUTO MODE — banner ở mọi step 0 */}
      {step === 0 && (
        <div className="card ts-auto-card">
          <div className="ts-auto-head">
            <Sparkles size={20} />
            <div>
              <h3>Tạo bài tự động</h3>
              <p>Không cần nhập gì — hệ thống tự bốc chủ đề, tìm câu chuyện thật, viết caption và lên kế hoạch ảnh.</p>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={runAuto} disabled={busy.auto}>
            {busy.auto
              ? <><Loader size={16} className="spin-icon" /> Đang tạo bài tự động… (~1-2 phút)</>
              : <><Sparkles size={16} /> 🤖 Tạo bài tự động ngay</>}
          </button>
          <p className="ts-auto-hint">Hoặc cuộn xuống để tự nhập chủ đề.</p>
        </div>
      )}

      <div className="card step-content">
        {/* Step 0 */}
        {step === 0 && (
          <div className="ts-grid">
            <div className="form-group full">
              <label>Chủ đề muốn tìm *</label>
              <input value={input.topic} onChange={(e) => update({ topic: e.target.value })} placeholder="VD: vụ mất tích bí ẩn, kỳ án chưa có lời giải, khám phá khoa học kỳ lạ..." />
            </div>
            <div className="form-group">
              <label>Loại nội dung</label>
              <select value={input.content_type} onChange={(e) => update({ content_type: e.target.value })}>
                {CONTENT_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Quốc gia / khu vực</label>
              <input value={input.country} onChange={(e) => update({ country: e.target.value })} placeholder="VD: Vietnam, USA, worldwide" />
            </div>
            <div className="form-group">
              <label>Ngôn ngữ nguồn</label>
              <select value={input.language} onChange={(e) => update({ language: e.target.value })}>
                <option value="auto">Auto (cả tiếng Anh và tiếng Việt)</option>
                <option value="vi">Chỉ tiếng Việt</option>
                <option value="en">Chỉ tiếng Anh</option>
              </select>
            </div>
            <div className="form-group">
              <label>Số câu chuyện</label>
              <select value={input.count} onChange={(e) => update({ count: parseInt(e.target.value) })}>
                {COUNT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="ts-providers-info full">
              <Info size={14} /> Providers đã bật: {Object.entries(providersDetail).filter(([k, v]) => v && k !== 'any').map(([k]) => k).join(', ') || 'không có'}
            </div>
          </div>
        )}

        {/* Step 1: Ideas */}
        {step === 1 && (
          <div>
            {!ideas.length && (
              <button className="btn btn-primary" onClick={runFindIdeas} disabled={busy.ideas}>
                {busy.ideas ? <><Loader size={14} className="spin-icon" /> Đang tìm câu chuyện thật...</> : <><Sparkles size={14} /> Tìm câu chuyện có thật</>}
              </button>
            )}
            {searchWarnings.length > 0 && (
              <div className="ts-warning"><AlertTriangle size={14} /> {searchWarnings.join(' • ')}</div>
            )}
            <div className="ts-ideas">
              {ideas.map((idea) => (
                <div key={idea.id} className={`ts-idea-card ${selectedIdeaId === idea.id ? 'selected' : ''}`}>
                  <div className="ts-idea-head">
                    <h4>{idea.title}</h4>
                    <VerifBadge status={idea.verification_status} />
                  </div>
                  <p className="ts-idea-summary">{idea.short_summary}</p>
                  {idea.why_it_is_interesting && <p className="ts-idea-why"><strong>Vì sao hấp dẫn:</strong> {idea.why_it_is_interesting}</p>}
                  {idea.mystery_point && <p className="ts-idea-mystery"><strong>Điểm bí ẩn:</strong> {idea.mystery_point}</p>}
                  {idea.suggested_hook && <p className="ts-idea-hook">💡 "{idea.suggested_hook}"</p>}
                  <div className="ts-idea-meta">
                    <span>{idea.sources.length} nguồn</span>
                    <span className={`ts-risk risk-${idea.risk_level}`}>risk: {idea.risk_level}</span>
                  </div>
                  <div className="ts-sources">
                    {idea.sources.slice(0, 4).map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer" className="ts-source-link">
                        <ExternalLink size={11} /> {s.source_name || new URL(s.url).hostname}
                      </a>
                    ))}
                  </div>
                  {idea.warning_notes?.length > 0 && (
                    <div className="ts-warning-small"><AlertTriangle size={12} /> {idea.warning_notes.join(' • ')}</div>
                  )}
                  <button className="btn btn-primary btn-sm ts-idea-pick" onClick={() => { setSelectedIdeaId(idea.id); runBrief(idea); }} disabled={busy.brief}>
                    {busy.brief && selectedIdeaId === idea.id ? <><Loader size={12} className="spin-icon" /> Đang đọc nguồn...</> : 'Chọn câu chuyện này'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Brief */}
        {step === 2 && brief && (
          <div>
            <h3>{brief.story_title}</h3>
            <p className="ts-brief-summary">{brief.summary}</p>

            {brief.timeline?.length > 0 && (
              <div className="ts-section">
                <h4>Timeline</h4>
                <ul>{brief.timeline.map((t, i) => <li key={i}><strong>{t.when}:</strong> {t.event}</li>)}</ul>
              </div>
            )}

            <div className="ts-two-col">
              {brief.people?.length > 0 && (
                <div className="ts-section">
                  <h4>Nhân vật</h4>
                  <ul>{brief.people.map((p, i) => <li key={i}>{p.name} {p.role && `— ${p.role}`}</li>)}</ul>
                </div>
              )}
              {brief.places?.length > 0 && (
                <div className="ts-section">
                  <h4>Địa điểm</h4>
                  <ul>{brief.places.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>

            <div className="ts-two-col">
              <div className="ts-section ts-section-verified">
                <h4>✓ Đã xác minh ({brief.verified_facts?.length || 0})</h4>
                <ul>{(brief.verified_facts || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
              <div className="ts-section ts-section-unknown">
                <h4>? Chưa rõ ({brief.unknown_parts?.length || 0})</h4>
                <ul>{(brief.unknown_parts || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            </div>

            {brief.disputed_points?.length > 0 && (
              <div className="ts-section ts-section-disputed">
                <h4>⚠ Các điểm còn tranh cãi giữa các nguồn</h4>
                <ul>{brief.disputed_points.map((d, i) => <li key={i}>{d}</li>)}</ul>
              </div>
            )}

            {brief.source_notes?.length > 0 && (
              <div className="ts-warning"><AlertTriangle size={14} /> {brief.source_notes.join(' • ')}</div>
            )}
          </div>
        )}

        {/* Step 3: Caption */}
        {step === 3 && (
          <div>
            {!caption && (
              <button className="btn btn-primary" onClick={() => runCaption()} disabled={busy.caption}>
                {busy.caption ? <><Loader size={14} className="spin-icon" /> Đang viết caption...</> : <><Wand2 size={14} /> Tạo caption Facebook</>}
              </button>
            )}
            {caption && (
              <>
                <div className="form-group">
                  <label>Tiêu đề</label>
                  <input value={caption.title} onChange={(e) => setCaption({ ...caption, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Caption (sửa được)</label>
                  <textarea rows={14} value={captionEdit} onChange={(e) => setCaptionEdit(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Thumbnail text (3-6 từ)</label>
                  <input value={caption.thumbnail_text} onChange={(e) => setCaption({ ...caption, thumbnail_text: e.target.value })} />
                </div>
                {caption.fact_check_notes?.length > 0 && (
                  <div className="ts-warning"><AlertTriangle size={14} /> Kiểm tra: {caption.fact_check_notes.join('; ')}</div>
                )}
                <div className="ts-regen-row">
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('viết lại bí ẩn hơn')} disabled={busy.caption}>Bí ẩn hơn</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('viết lại tăng cảm xúc')} disabled={busy.caption}>Cảm xúc hơn</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('viết lại ngắn hơn, súc tích hơn')} disabled={busy.caption}>Ngắn hơn</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('giảm giật tít, dùng ngôn ngữ thận trọng hơn')} disabled={busy.caption}>Giảm giật tít</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Image */}
        {step === 4 && (
          <div>
            {!imagePlan && (
              <button className="btn btn-primary" onClick={runImagePlan} disabled={busy.imagePlan}>
                {busy.imagePlan ? <><Loader size={14} className="spin-icon" /> Đang lập kế hoạch ảnh...</> : <><Sparkles size={14} /> Kế hoạch ảnh từ AI</>}
              </button>
            )}
            {imagePlan && (
              <>
                <div className="ts-img-rec">
                  <Info size={14} /> Khuyến nghị: <strong>{imagePlan.recommended_mode === 'upload_real_image' ? 'Ảnh thật' : 'Ảnh AI minh hoạ'}</strong> — {imagePlan.reason}
                </div>

                <div className="ts-img-tabs">
                  <button className={`ts-img-tab ${imageMode === 'upload_real_image' ? 'active' : ''}`} onClick={() => setImageMode('upload_real_image')}>
                    <Camera size={14} /> Ảnh thật
                  </button>
                  <button className={`ts-img-tab ${imageMode === 'ai_illustration' ? 'active' : ''}`} onClick={() => setImageMode('ai_illustration')}>
                    <Wand2 size={14} /> Ảnh AI minh hoạ
                  </button>
                </div>

                {imageMode === 'upload_real_image' && (
                  <div className="ts-real-image">
                    <p className="ts-tip">Ưu tiên ảnh thật nếu bạn có quyền sử dụng. Kiểm tra bản quyền trước khi đăng.</p>
                    {imagePlan.real_image_suggestions?.length > 0 && (
                      <div className="ts-source-images">
                        <p className="ts-section-label">Ảnh gợi ý từ các nguồn:</p>
                        <div className="ts-source-img-grid">
                          {imagePlan.real_image_suggestions.map((url, i) => (
                            <button key={i} type="button" className={`ts-source-img ${imageUrl === url ? 'selected' : ''}`} onClick={() => pickSourceImage(url)}>
                              <img src={url} alt="" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="ts-upload-row">
                      <label className="btn btn-secondary btn-sm" htmlFor="ts-up">
                        <Upload size={14} /> Tải ảnh từ máy
                        <input id="ts-up" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
                      </label>
                      <input className="ts-url-input" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); if (e.target.value) setImagePreview(e.target.value); }} placeholder="hoặc dán link ảnh..." />
                    </div>
                  </div>
                )}

                {imageMode === 'ai_illustration' && (
                  <>
                    <div className="ts-warning"><AlertTriangle size={14} /> Ảnh AI minh hoạ — KHÔNG phải ảnh tư liệu thật. Không nên trình bày như bằng chứng.</div>
                    <div className="form-group">
                      <label>Mẫu ảnh (documentary / editorial)</label>
                      <div className="ts-tpl-grid">
                        {TRUE_STORY_IMAGE_TEMPLATES.map((t) => (
                          <button key={t.id} type="button" className={`ts-tpl-card ${selectedTemplate === t.id ? 'selected' : ''}`}
                            onClick={() => { setSelectedTemplate(t.id); setImagePrompt(buildTrueStoryPrompt(t.id, { product: input.topic, thumbnail_text: caption?.thumbnail_text })); }}>
                            <span className="ts-tpl-icon">{t.icon}</span>
                            <span className="ts-tpl-name">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Image prompt</label>
                      <textarea rows={6} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} />
                    </div>
                    <div className="ts-img-action-bar">
                      <button className="btn btn-primary" onClick={runGenerateImage} disabled={busy.image}>
                        {busy.image ? <><Loader size={14} className="spin-icon" /> Đang tạo ảnh...</> : <><Wand2 size={14} /> Tạo ảnh minh hoạ bằng GPT Image 2</>}
                      </button>
                      {aiModels.image.length > 0 && (
                        <select className="model-select" value={imgModel} onChange={(e) => setImgModel(e.target.value)}>
                          {aiModels.image.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                        </select>
                      )}
                    </div>
                  </>
                )}

                {imagePreview && (
                  <div className="image-preview-wrapper">
                    <img src={imagePreview} alt="preview" className="image-preview-img" />
                    <button className="image-clear-btn" onClick={clearImage}><X size={16} /></button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 5: Preview & publish */}
        {step === 5 && (
          <div>
            <div className="ts-verification-summary">
              {selectedIdea && <VerifBadge status={selectedIdea.verification_status} />}
              <span>{selectedIdea?.sources?.length || 0} nguồn</span>
              {selectedIdea?.verification_status === 'weak' && (
                <span className="ts-warn-inline">⚠ Câu chuyện này chỉ có 1 nguồn — kiểm tra thêm trước khi đăng.</span>
              )}
            </div>

            <div className="form-group page-selector-group">
              <label><Globe size={14} /> Đăng lên Page</label>
              {activePages.length === 0 ? (
                <div className="page-selector-empty">Chưa có page — <a href="/pages">thêm page →</a></div>
              ) : (
                <div className="page-selector-grid">
                  {activePages.map((p) => (
                    <button key={p.id} type="button" className={`page-selector-item ${parseInt(fbPageId) === p.id ? 'selected' : ''}`} onClick={() => setFbPageId(p.id)} style={{ '--psc': p.color }}>
                      <span className="ps-avatar" style={{ borderColor: p.color }}>
                        {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <span style={{ color: p.color }}>{p.name.charAt(0)}</span>}
                      </span>
                      <span className="ps-name">{p.name}</span>
                      {parseInt(fbPageId) === p.id && <span className="ps-check">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="fb-preview">
              <div className="fb-preview-header">
                <div className="fb-preview-avatar" style={{ background: selectedPage?.color || 'var(--primary)' }}>
                  {selectedPage?.avatar_url ? <img src={selectedPage.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (selectedPage?.name?.charAt(0) || 'IA')}
                </div>
                <div><div className="fb-preview-name">{selectedPage?.name || 'Chọn page'}</div><div className="fb-preview-time">Vừa xong</div></div>
              </div>
              <div className="fb-preview-caption">{captionEdit || 'Caption sẽ hiển thị ở đây...'}</div>
              {imagePreview && <img className="fb-preview-image" src={imagePreview} alt="" />}
            </div>

            <div className="form-group" style={{ maxWidth: 360, marginTop: 16 }}>
              <label><Clock size={14} /> Lên lịch đăng</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>

            {selectedIdea?.sources?.length > 0 && (
              <div className="ts-sources-list">
                <strong>Nguồn được lưu cùng bài (sẽ kèm vào metadata):</strong>
                <ul>
                  {selectedIdea.sources.map((s, i) => (
                    <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.source_name || s.url}</a></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="wizard-actions">
        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft size={16} /> Quay lại</button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {step === 0 && <button className="btn btn-primary" onClick={runFindIdeas} disabled={busy.ideas}>{busy.ideas ? <><Loader size={14} className="spin-icon" /> Đang tìm...</> : <>Tìm câu chuyện <ChevronRight size={16} /></>}</button>}
          {step === 1 && ideas.length > 0 && selectedIdea && <button className="btn btn-primary" onClick={() => setStep(2)}>Xem brief <ChevronRight size={16} /></button>}
          {step === 2 && brief && <button className="btn btn-primary" onClick={() => { setStep(3); if (!caption) runCaption(); }}>Tạo caption <ChevronRight size={16} /></button>}
          {step === 3 && caption && <button className="btn btn-primary" onClick={() => { setStep(4); if (!imagePlan) runImagePlan(); }}>Hình ảnh <ChevronRight size={16} /></button>}
          {step === 4 && <button className="btn btn-primary" onClick={() => setStep(5)}>Đăng <ChevronRight size={16} /></button>}
          {step === 5 && (
            <>
              <button className="btn btn-secondary" onClick={() => handleSave('draft')} disabled={busy.save}><FileText size={15} /> Lưu nháp</button>
              <button className="btn btn-info" onClick={() => handleSave('draft', 'publish_draft')} disabled={busy.save}><Eye size={15} /> Nháp FB</button>
              {scheduledAt && <button className="btn btn-warning" onClick={() => handleSave('scheduled', 'publish_scheduled')} disabled={busy.save}><CalendarClock size={15} /> Hẹn giờ</button>}
              <button className="btn btn-success" onClick={() => handleSave('draft', 'publish_now')} disabled={busy.save}><Send size={15} /> Đăng ngay</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
