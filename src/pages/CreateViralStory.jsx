/**
 * Create Viral Story — luồng tạo bài kể chuyện có thật / bí ẩn / điều tra.
 *
 * Bước:
 *   1. Nhập câu chuyện
 *   2. AI phân tích (brief)
 *   3. Chọn hook (1 trong 5 angle)
 *   4. Caption (regenerate được)
 *   5. Hình ảnh (upload thật hoặc AI)
 *   6. Kiểm tra & đăng
 *
 * Tận dụng các action đăng/nháp/hẹn giờ của createPost cũ → không phá luồng.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Wand2, Upload, Globe, Loader, ChevronLeft, ChevronRight,
  FileText, Eye, CalendarClock, Send, Clock, AlertTriangle, CheckCircle2,
  Camera, ImagePlus, X, Info,
} from 'lucide-react';
import {
  generateStoryBrief, generateStoryAngles, generateStoryCaption,
  generateStoryImagePlan, qualityCheckStoryPost, generateImage,
  getAiProviders, createPost, publishPost, publishDraft, publishScheduled,
} from '../utils/api';
import { IMAGE_TEMPLATES, buildPromptFromTemplate } from '../config/imageTemplates';
import { usePageContext } from '../contexts/PageContext';
import { useToast } from '../components/Toast';
import './CreateViralStory.css';

const STEPS = ['Câu chuyện', 'Phân tích', 'Hook', 'Caption', 'Hình ảnh', 'Kiểm tra & đăng'];

const CONTENT_TYPES = [
  { id: 'true_mystery', label: 'Chuyện bí ẩn có thật' },
  { id: 'investigation', label: 'Vụ việc kỳ lạ' },
  { id: 'character_profile', label: 'Hồ sơ nhân vật' },
  { id: 'strange_history', label: 'Lịch sử gây sốc' },
  { id: 'emotional', label: 'Câu chuyện cảm động' },
  { id: 'strange_discovery', label: 'Khám phá kỳ lạ' },
  { id: 'breaking', label: 'Tin nóng' },
];

const CREATIVITY_LEVELS = [
  { id: 'stick_to_facts', label: 'Bám sát sự thật' },
  { id: 'light_dramatization', label: 'Kể chuyện hấp dẫn nhẹ' },
  { id: 'dramatic_no_lie', label: 'Kịch tính nhưng không bịa' },
];

const initialInput = {
  topic: '',
  content_type: 'true_mystery',
  source_url: '',
  source_text: '',
  location: '',
  time_context: '',
  main_character: '',
  mystery_point: '',
  verified_facts: '',
  unknown_parts: '',
  creativity_level: 'light_dramatization',
  target_audience: 'người dùng Facebook Việt Nam 25-45 tuổi',
};

const splitLines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

export default function CreateViralStory() {
  const nav = useNavigate();
  const toast = useToast();
  const { activePage, pages } = usePageContext();

  const [step, setStep] = useState(0);
  const [input, setInput] = useState(initialInput);
  const [brief, setBrief] = useState(null);
  const [angles, setAngles] = useState([]);
  const [selectedAngleIdx, setSelectedAngleIdx] = useState(0);
  const [caption, setCaption] = useState(null);
  const [captionEdit, setCaptionEdit] = useState('');
  const [imagePlan, setImagePlan] = useState(null);
  const [qc, setQC] = useState(null);

  const [busy, setBusy] = useState({ brief: false, angles: false, caption: false, imagePlan: false, image: false, qc: false, save: false });

  // Image state
  const [imageMode, setImageMode] = useState('upload_real_image'); // 'upload_real_image' | 'generate_ai_image'
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imgModel, setImgModel] = useState('');
  const [aiModels, setAiModels] = useState({ image: [] });
  const [selectedTemplate, setSelectedTemplate] = useState('documentary-mystery');

  // Posting
  const [fbPageId, setFbPageId] = useState(activePage || '');
  const [scheduledAt, setScheduledAt] = useState('');

  const update = (patch) => setInput((s) => ({ ...s, ...patch }));

  useEffect(() => {
    getAiProviders().then((r) => {
      const data = r.data?.data;
      setAiModels(data?.models || { image: [] });
      const imgs = data?.models?.image || [];
      const gptImg2 = imgs.find((m) => m.id === 'gpt-image-2');
      if (gptImg2) setImgModel(gptImg2.id);
      else if (imgs[0]) setImgModel(imgs[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => { setFbPageId(activePage || ''); }, [activePage]);

  /* ---- Step actions ---- */

  const runAnalyze = async () => {
    if (!input.topic && !input.source_text) {
      toast.warning('Cần ít nhất chủ đề hoặc nội dung nguồn');
      return;
    }
    setBusy((b) => ({ ...b, brief: true, angles: true }));
    try {
      const briefRes = await generateStoryBrief({
        ...input,
        verified_facts: splitLines(input.verified_facts),
        unknown_parts: splitLines(input.unknown_parts),
      });
      const b = briefRes.data.data;
      setBrief(b);

      const angRes = await generateStoryAngles(b);
      const arr = angRes.data.data || [];
      setAngles(arr);
      setSelectedAngleIdx(0);
      setStep(2);
    } catch (e) {
      toast.error('Lỗi phân tích: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusy((b) => ({ ...b, brief: false, angles: false }));
    }
  };

  const runCaption = async (extraNote) => {
    if (!brief || !angles[selectedAngleIdx]) return;
    setBusy((b) => ({ ...b, caption: true }));
    try {
      const res = await generateStoryCaption({
        brief,
        selected_angle: angles[selectedAngleIdx],
        creativity_level: input.creativity_level,
        target_audience: extraNote ? `${input.target_audience} — ${extraNote}` : input.target_audience,
      });
      const cap = res.data.data;
      setCaption(cap);
      setCaptionEdit(cap.caption);
    } catch (e) {
      toast.error('Lỗi tạo caption: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusy((b) => ({ ...b, caption: false }));
    }
  };

  const runImagePlan = async () => {
    if (!brief || !angles[selectedAngleIdx]) return;
    setBusy((b) => ({ ...b, imagePlan: true }));
    try {
      const res = await generateStoryImagePlan({
        brief,
        selected_angle: angles[selectedAngleIdx],
        caption_meta: caption ? { thumbnail_text: caption.thumbnail_text, title: caption.title } : {},
      });
      const plan = res.data.data;
      setImagePlan(plan);
      setImageMode(plan.image_mode_recommendation || 'generate_ai_image');
      setImagePrompt(plan.image_prompt || buildPromptFromTemplate(selectedTemplate, { product: input.topic, thumbnail_text: caption?.thumbnail_text || '' }));
    } catch (e) {
      toast.error('Lỗi tạo image plan: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusy((b) => ({ ...b, imagePlan: false }));
    }
  };

  const runGenerateImage = async () => {
    setBusy((b) => ({ ...b, image: true }));
    try {
      const finalPrompt = imagePrompt || buildPromptFromTemplate(selectedTemplate, { product: input.topic, thumbnail_text: caption?.thumbnail_text || '' });
      const res = await generateImage({
        product: input.topic || caption?.title || 'story',
        custom_prompt: finalPrompt,
        prefer_model: imgModel || undefined,
      });
      const data = res.data.data;
      if (data?.url) {
        setImagePreview(data.url);
        setImageFile(null);
      }
    } catch (e) {
      toast.error('Lỗi tạo ảnh: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusy((b) => ({ ...b, image: false }));
    }
  };

  const runQC = async () => {
    setBusy((b) => ({ ...b, qc: true }));
    try {
      const res = await qualityCheckStoryPost({
        brief,
        caption: captionEdit,
        thumbnail_text: caption?.thumbnail_text || '',
        image_prompt: imagePrompt,
      });
      setQC(res.data.data);
    } catch (e) {
      toast.error('Lỗi quality check: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusy((b) => ({ ...b, qc: false }));
    }
  };

  const handleUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const clearImage = () => { setImageFile(null); setImagePreview(''); };

  const handleSave = async (status, action) => {
    if (!caption || !captionEdit) return toast.warning('Cần có caption trước khi đăng');
    if (!fbPageId) return toast.warning('Chọn Page để đăng');
    setBusy((b) => ({ ...b, save: true }));
    try {
      const fd = new FormData();
      fd.append('title', caption.title || input.topic);
      fd.append('caption', captionEdit);
      fd.append('status', status);
      fd.append('fb_page_id', fbPageId);
      if (scheduledAt) fd.append('scheduled_at', scheduledAt);
      if (imageFile) fd.append('image', imageFile);
      else if (imagePreview) fd.append('image_url', imagePreview);
      const res = await createPost(fd);
      const postId = res.data.data.id;
      if (action === 'publish_now') { await publishPost(postId); toast.success('Đã đăng bài lên Facebook!'); }
      else if (action === 'publish_draft') { await publishDraft(postId); toast.success('Đã đăng nháp lên Facebook!'); }
      else if (action === 'publish_scheduled' && scheduledAt) { await publishScheduled(postId, scheduledAt); toast.success('Đã hẹn giờ đăng!'); }
      else toast.info('Đã lưu vào hệ thống');
      nav('/posts');
    } catch (e) {
      toast.error('Lỗi lưu bài: ' + (e.response?.data?.error || e.message));
    } finally {
      setBusy((b) => ({ ...b, save: false }));
    }
  };

  const selectedPage = useMemo(() => pages.find((p) => p.id === parseInt(fbPageId)), [pages, fbPageId]);
  const activePages = pages.filter((p) => p.is_active);

  /* ============ RENDER ============ */
  return (
    <div className="cvs-page animate-in">
      <div className="page-header">
        <div>
          <h1>Tạo bài kể chuyện viral</h1>
          <p className="page-subtitle">Chuyện có thật, bí ẩn, vụ việc kỳ lạ — giật tít nhưng không bịa</p>
        </div>
      </div>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} onClick={() => setStep(i)}>{s}</div>
        ))}
      </div>

      <div className="card step-content">
        {/* Step 0: Input */}
        {step === 0 && (
          <div className="cvs-grid">
            <div className="form-group">
              <label>Chủ đề câu chuyện *</label>
              <input value={input.topic} onChange={(e) => update({ topic: e.target.value })} placeholder="VD: Một người đàn ông biến mất sau chuyến đi rừng" />
            </div>
            <div className="form-group">
              <label>Loại nội dung</label>
              <select value={input.content_type} onChange={(e) => update({ content_type: e.target.value })}>
                {CONTENT_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Mức sáng tạo</label>
              <select value={input.creativity_level} onChange={(e) => update({ creativity_level: e.target.value })}>
                {CREATIVITY_LEVELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group full">
              <label>Link nguồn (URL)</label>
              <input value={input.source_url} onChange={(e) => update({ source_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="form-group full">
              <label>Dán nội dung nguồn</label>
              <textarea rows={5} value={input.source_text} onChange={(e) => update({ source_text: e.target.value })} placeholder="Dán bài báo gốc / lời kể / tư liệu thật..." />
            </div>
            <div className="form-group"><label>Địa điểm</label><input value={input.location} onChange={(e) => update({ location: e.target.value })} placeholder="VD: một khu rừng gần làng" /></div>
            <div className="form-group"><label>Mốc thời gian</label><input value={input.time_context} onChange={(e) => update({ time_context: e.target.value })} placeholder="VD: sáng thứ hai" /></div>
            <div className="form-group"><label>Nhân vật chính</label><input value={input.main_character} onChange={(e) => update({ main_character: e.target.value })} placeholder="VD: một người đàn ông địa phương" /></div>
            <div className="form-group"><label>Điểm bí ẩn / nút thắt</label><input value={input.mystery_point} onChange={(e) => update({ mystery_point: e.target.value })} placeholder="VD: bức ảnh cuối cùng trước khi mất liên lạc" /></div>
            <div className="form-group full"><label>Chi tiết đã xác minh (mỗi dòng 1 ý)</label><textarea rows={3} value={input.verified_facts} onChange={(e) => update({ verified_facts: e.target.value })} placeholder="VD:\nÔng rời nhà sáng thứ hai\nGia đình mất liên lạc lúc 17h" /></div>
            <div className="form-group full"><label>Điều chưa rõ (mỗi dòng 1 ý)</label><textarea rows={3} value={input.unknown_parts} onChange={(e) => update({ unknown_parts: e.target.value })} placeholder="VD:\nLý do mất tích\nNơi bức ảnh cuối được chụp" /></div>
          </div>
        )}

        {/* Step 1: Analyzing */}
        {step === 1 && (
          <div className="cvs-analyze">
            <p>Sẵn sàng phân tích câu chuyện. AI sẽ tách rõ điều đã được xác minh và điều còn bỏ ngỏ.</p>
            <button className="btn btn-primary" onClick={runAnalyze} disabled={busy.brief}>
              {busy.brief ? <><Loader size={14} className="spin-icon" /> Đang phân tích...</> : <><Sparkles size={14} /> Phân tích câu chuyện</>}
            </button>
          </div>
        )}

        {/* Step 2: Hooks */}
        {step === 2 && brief && (
          <div>
            <div className="cvs-brief">
              <h4>Tóm tắt</h4>
              <p>{brief.summary}</p>
              <div className="cvs-facts-row">
                <div>
                  <strong>✓ Đã xác minh</strong>
                  <ul>{brief.verified_facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
                <div>
                  <strong>? Chưa rõ</strong>
                  <ul>{brief.unknown_parts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              </div>
              {brief.safety_notes?.length > 0 && (
                <div className="cvs-warning"><AlertTriangle size={14} /> {brief.safety_notes.join(' • ')}</div>
              )}
            </div>

            <h4 style={{ marginTop: 24 }}>Chọn 1 trong {angles.length} hook</h4>
            <div className="cvs-angles">
              {angles.map((a, i) => (
                <button key={i} type="button" className={`cvs-angle-card ${selectedAngleIdx === i ? 'selected' : ''}`} onClick={() => setSelectedAngleIdx(i)}>
                  <div className="cvs-angle-title">{a.title}</div>
                  <div className="cvs-angle-hook">"{a.hook}"</div>
                  <div className="cvs-angle-meta">
                    <span className="tag">{a.style}</span>
                    <span className={`tag risk-${a.risk_level}`}>risk: {a.risk_level}</span>
                  </div>
                  <p className="cvs-angle-reason">{a.reason_why_it_works}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Caption */}
        {step === 3 && (
          <div>
            {!caption && (
              <button className="btn btn-primary" onClick={() => runCaption()} disabled={busy.caption}>
                {busy.caption ? <><Loader size={14} className="spin-icon" /> Đang tạo caption...</> : <><Wand2 size={14} /> Tạo caption</>}
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
                  <textarea rows={12} value={captionEdit} onChange={(e) => setCaptionEdit(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Text overlay ảnh (3-6 từ)</label>
                  <input value={caption.thumbnail_text} onChange={(e) => setCaption({ ...caption, thumbnail_text: e.target.value })} />
                </div>
                {caption.fact_check_notes?.length > 0 && (
                  <div className="cvs-warning"><AlertTriangle size={14} /> Cần kiểm tra: {caption.fact_check_notes.join('; ')}</div>
                )}
                <div className="cvs-regen-row">
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('bí ẩn hơn, ít khẳng định hơn')} disabled={busy.caption}>Bí ẩn hơn</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('chân thực hơn, ít drama')} disabled={busy.caption}>Chân thực hơn</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('giảm giật tít')} disabled={busy.caption}>Giảm giật tít</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => runCaption('tăng cảm xúc, vẫn chân thực')} disabled={busy.caption}>Tăng cảm xúc</button>
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
                {busy.imagePlan ? <><Loader size={14} className="spin-icon" /> Đang lập kế hoạch ảnh...</> : <><Sparkles size={14} /> Để AI gợi ý kế hoạch ảnh</>}
              </button>
            )}
            {imagePlan && (
              <>
                <div className="cvs-img-rec">
                  <Info size={14} /> Khuyến nghị: <strong>{imagePlan.image_mode_recommendation === 'upload_real_image' ? 'Upload ảnh thật' : 'Tạo ảnh AI minh hoạ'}</strong> — {imagePlan.reason}
                </div>

                <div className="cvs-img-tabs">
                  <button className={`cvs-img-tab ${imageMode === 'upload_real_image' ? 'active' : ''}`} onClick={() => setImageMode('upload_real_image')}><Camera size={14} /> Upload ảnh thật</button>
                  <button className={`cvs-img-tab ${imageMode === 'generate_ai_image' ? 'active' : ''}`} onClick={() => setImageMode('generate_ai_image')}><Wand2 size={14} /> Tạo ảnh AI</button>
                </div>

                {imageMode === 'upload_real_image' && (
                  <div className="cvs-upload-area">
                    <p className="cvs-tip">Khuyến nghị dùng ảnh thật nếu câu chuyện có nguồn thật.</p>
                    <label className="btn btn-secondary" htmlFor="cvs-up">
                      <Upload size={14} /> Tải ảnh thật lên
                      <input id="cvs-up" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
                    </label>
                  </div>
                )}

                {imageMode === 'generate_ai_image' && (
                  <>
                    <div className="cvs-warning"><AlertTriangle size={14} /> Ảnh AI minh hoạ — nên kiểm tra trước khi đăng, không trình bày như ảnh tư liệu thật.</div>
                    <div className="form-group">
                      <label>Mẫu ảnh</label>
                      <div className="cvs-tpl-grid">
                        {IMAGE_TEMPLATES.filter((t) => t.id !== 'upload-real-image').map((t) => (
                          <button key={t.id} type="button" className={`cvs-tpl-card ${selectedTemplate === t.id ? 'selected' : ''}`}
                            onClick={() => { setSelectedTemplate(t.id); setImagePrompt(buildPromptFromTemplate(t.id, { product: input.topic, thumbnail_text: caption?.thumbnail_text || '' })); }}>
                            <span className="cvs-tpl-icon">{t.icon}</span>
                            <span className="cvs-tpl-name">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Image prompt (chỉnh được)</label>
                      <textarea rows={5} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} />
                    </div>
                    <div className="cvs-img-action-bar">
                      <button className="btn btn-primary" onClick={runGenerateImage} disabled={busy.image}>
                        {busy.image ? <><Loader size={14} className="spin-icon" /> Đang tạo ảnh...</> : <><Wand2 size={14} /> Tạo ảnh AI minh hoạ</>}
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

        {/* Step 5: QC + publish */}
        {step === 5 && (
          <div>
            <button className="btn btn-secondary" onClick={runQC} disabled={busy.qc}>
              {busy.qc ? <><Loader size={14} className="spin-icon" /> Đang kiểm tra...</> : <><CheckCircle2 size={14} /> Chạy quality check</>}
            </button>
            {qc && (
              <div className="cvs-qc">
                <div className={`cvs-qc-status ${qc.passed ? 'passed' : 'warn'}`}>
                  {qc.passed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  {qc.passed ? 'Đạt — sẵn sàng đăng' : 'Cần kiểm tra lại'}
                </div>
                {qc.warnings.length > 0 && (
                  <div className="cvs-qc-block">
                    <strong>Cảnh báo</strong>
                    <ul>{qc.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>
                )}
                {qc.suggestions.length > 0 && (
                  <div className="cvs-qc-block">
                    <strong>Gợi ý</strong>
                    <ul>{qc.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                <div className="cvs-qc-scores">
                  {Object.entries(qc.score).map(([k, v]) => (
                    <div key={k} className="cvs-qc-score"><span>{k}</span><strong>{v}/10</strong></div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group page-selector-group" style={{ marginTop: 24 }}>
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
          </div>
        )}
      </div>

      <div className="wizard-actions">
        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft size={16} /> Quay lại</button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {step === 0 && <button className="btn btn-primary" onClick={() => { setStep(1); }}>Tiếp theo <ChevronRight size={16} /></button>}
          {step === 1 && !brief && <button className="btn btn-primary" onClick={runAnalyze} disabled={busy.brief}>Phân tích <ChevronRight size={16} /></button>}
          {step === 1 && brief && <button className="btn btn-primary" onClick={() => setStep(2)}>Tiếp theo <ChevronRight size={16} /></button>}
          {step === 2 && angles.length > 0 && <button className="btn btn-primary" onClick={() => { setStep(3); if (!caption) runCaption(); }}>Tạo caption <ChevronRight size={16} /></button>}
          {step === 3 && caption && <button className="btn btn-primary" onClick={() => { setStep(4); if (!imagePlan) runImagePlan(); }}>Tiếp theo <ChevronRight size={16} /></button>}
          {step === 4 && <button className="btn btn-primary" onClick={() => setStep(5)}>Kiểm tra & đăng <ChevronRight size={16} /></button>}
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
