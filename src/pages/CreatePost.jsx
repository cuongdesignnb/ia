import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, ChevronRight, ChevronLeft, Upload, Clock, Loader, Globe, Wand2, ImagePlus, X, Edit3, LayoutGrid, FileText, CalendarClock, Eye } from 'lucide-react';
import { getStyles, generateCaption, generateImage, createPost, getAiProviders, publishPost, publishDraft, publishScheduled } from '../utils/api';
import { usePageContext } from '../contexts/PageContext';
import { useToast } from '../components/Toast';
import './CreatePost.css';

const STEPS = ['Phong cách', 'Nội dung', 'Hình ảnh', 'Xem trước'];

// ==========================================
// MẪU ẢNH — Chuyên tin tức / báo chí / sản phẩm
// ==========================================
const IMAGE_TEMPLATES = [
  // --- TIN TỨC / BÁO CHÍ ---
  {
    id: 'breaking-news',
    name: 'Breaking News',
    icon: '🚨',
    category: 'news',
    desc: 'Tin nóng, khẩn cấp, nổi bật',
    prompt: 'Create a dramatic breaking news editorial image about "{{product}}". Dark cinematic background, bold red and white headline text overlay in Vietnamese, urgent atmosphere, photojournalistic style, dramatic lighting, TV news broadcast quality, 4k resolution',
  },
  {
    id: 'news-infographic',
    name: 'Infographic Tin tức',
    icon: '📊',
    category: 'news',
    desc: 'Đồ hoạ thông tin dạng báo chí',
    prompt: 'Create a detailed news infographic about "{{product}}" in dark theme style. Include data visualization panels, icon-based statistics, timeline or process diagram, modern flat design, Vietnamese text labels, professional data journalism layout with dark navy/black background and bright accent colors, 4k quality',
  },
  {
    id: 'clickbait-headline',
    name: 'Giật tít / Clickbait',
    icon: '⚡',
    category: 'news',
    desc: 'Tiêu đề giật gân, thu hút click cực mạnh',
    prompt: 'Create a sensational viral Facebook news thumbnail about "{{product}}". Dramatic photo with bold Vietnamese headline text overlay in large white and yellow font, dark gradient overlay on bottom half, shocked/dramatic facial expressions or intense scene, red circle highlights, arrow annotations, maximum visual impact, clickbait style, 4k quality',
  },
  {
    id: 'investigation',
    name: 'Phóng sự Điều tra',
    icon: '🔍',
    category: 'news',
    desc: 'Phong cách điều tra, phơi bày sự thật',
    prompt: 'Create an investigative journalism cover image about "{{product}}". Dark moody atmosphere, spotlight effect, detective/investigation theme, document papers scattered, magnifying glass, red string board aesthetic, mysterious dramatic lighting, Vietnamese headline text, noir style, 4k quality',
  },
  {
    id: 'hot-event',
    name: 'Sự kiện Nóng',
    icon: '🔥',
    category: 'news',
    desc: 'Sự kiện đang hot, trending',
    prompt: 'Create an intense trending event news image about "{{product}}". Split-screen or multi-panel layout showing key moments, fire/heat visual effects, bold Vietnamese text overlay with glowing effect, breaking news ticker style bar at bottom, intense dramatic atmosphere, social media viral post quality, 4k resolution',
  },
  {
    id: 'tech-news',
    name: 'Tin Công nghệ',
    icon: '💻',
    category: 'news',
    desc: 'Tin tức công nghệ, startup, AI',
    prompt: 'Create a sleek technology news cover image about "{{product}}". Futuristic dark blue/purple gradient background, holographic elements, circuit board patterns, glowing neon accents, modern sans-serif Vietnamese headline, tech-forward editorial design, digital data visualization overlay, 4k quality',
  },
  {
    id: 'data-stats',
    name: 'Tổng hợp Số liệu',
    icon: '📈',
    category: 'news',
    desc: 'Biểu đồ, số liệu, thống kê nổi bật',
    prompt: 'Create a data-driven statistics graphic about "{{product}}". Dark background with glowing charts, bar graphs, percentage numbers in large bold font, key metrics highlighted in colored boxes, Vietnamese labels, professional data journalism style similar to Bloomberg or Reuters infographics, 4k quality',
  },
  {
    id: 'quote-person',
    name: 'Trích dẫn Nhân vật',
    icon: '💬',
    category: 'news',
    desc: 'Quote nhân vật quan trọng, chuyên gia',
    prompt: 'Create an editorial quote card about "{{product}}". Professional portrait silhouette on one side, large quotation marks, Vietnamese quote text in elegant serif font, gradient dark background, subtle texture overlay, news interview style, authoritative and credible design, 4k quality',
  },
  {
    id: 'comparison',
    name: 'So sánh / Đối chiếu',
    icon: '⚖️',
    category: 'news',
    desc: 'So sánh 2 bên, đối chiếu thông tin',
    prompt: 'Create a VS comparison infographic about "{{product}}". Split screen design with two contrasting sides, versus symbol in center, key differences listed on each side, dark dramatic background, bold Vietnamese text, competitive analysis style, sports matchup aesthetic, 4k quality',
  },
  // --- SẢN PHẨM / THƯƠNG MẠI ---
  {
    id: 'product-studio',
    name: 'Ảnh SP Studio',
    icon: '📸',
    category: 'product',
    desc: 'Nền trắng, ánh sáng studio',
    prompt: 'Professional product photography of {{product}}, clean white background, studio lighting, commercial style, 4k quality, high detail',
  },
  {
    id: 'sale-banner',
    name: 'Banner Sale',
    icon: '🏷️',
    category: 'product',
    desc: 'Banner khuyến mãi nổi bật',
    prompt: 'Eye-catching sale promotion banner for {{product}}, bold red and gold color scheme, Vietnamese text "GIẢM GIÁ SỐC", modern typography, urgency design, vibrant layout, 4k quality',
  },
  {
    id: 'hero-banner',
    name: 'Hero Banner FB',
    icon: '🖼️',
    category: 'product',
    desc: 'Banner ngang cho Facebook',
    prompt: 'Wide hero banner for Facebook post featuring {{product}}, cinematic composition, dramatic lighting, premium brand feel, landscape 16:9 ratio, 4k quality',
  },
  // --- TUỲ CHỈNH ---
  {
    id: 'custom',
    name: 'Tuỳ chỉnh',
    icon: '✏️',
    category: 'custom',
    desc: 'Tự viết prompt theo ý bạn',
    prompt: '',
  },
];

export default function CreatePost() {
  const nav = useNavigate();
  const toast = useToast();
  const { activePage, activePageData, pages } = usePageContext();
  const [step, setStep] = useState(0);
  const [styles, setStyles] = useState([]);
  const [aiModels, setAiModels] = useState({ caption: [], image: [] });
  const [form, setForm] = useState({
    title: '', product: '', caption: '', style_id: null, image_url: '', status: 'draft', scheduled_at: '',
    fb_page_id: activePage || '',
  });
  const [genLoading, setGenLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  // AI Image generation
  const [imgModel, setImgModel] = useState('');
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgGenLoading, setImgGenLoading] = useState(false);
  const [imgGenResult, setImgGenResult] = useState(null);
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);
  const [imgGenElapsed, setImgGenElapsed] = useState(0);

  // Image template
  const [selectedTemplate, setSelectedTemplate] = useState('breaking-news');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [editablePrompt, setEditablePrompt] = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // Caption model
  const [captionModel, setCaptionModel] = useState('');

  useEffect(() => {
    getStyles().then(r => setStyles(r.data.data)).catch(() => { });
    getAiProviders().then(r => {
      const data = r.data.data;
      setAiModels(data.models);
      if (data.models.image.length > 0) setImgModel(data.models.image[0].id);
      if (data.models.caption.length > 0) setCaptionModel(data.models.caption[0].id);
    }).catch(() => { });
  }, []);

  useEffect(() => { setForm(f => ({ ...f, fb_page_id: activePage || '' })); }, [activePage]);

  // Build prompt from template when product or template changes
  const buildPrompt = (templateId, product) => {
    const tpl = IMAGE_TEMPLATES.find(t => t.id === templateId);
    if (!tpl || templateId === 'custom') return editablePrompt;
    return tpl.prompt.replace(/\{\{product\}\}/g, product || 'sản phẩm');
  };

  // Update editable prompt when template/product changes
  useEffect(() => {
    if (selectedTemplate !== 'custom') {
      const built = buildPrompt(selectedTemplate, form.product);
      setEditablePrompt(built);
    }
  }, [selectedTemplate, form.product]);

  // Auto-generate when entering image step
  useEffect(() => {
    if (step === 2 && form.product && !imagePreview && !autoGenTriggered && aiModels.image.length > 0) {
      setAutoGenTriggered(true);
      // Build prompt from selected template
      const prompt = buildPrompt(selectedTemplate, form.product);
      setEditablePrompt(prompt);
      handleAiImageGenerate(prompt);
    }
  }, [step]);

  // Auto match style → image template
  useEffect(() => {
    if (form.style_id && selectedTemplate === 'breaking-news') {
      const style = styles.find(s => s.id === form.style_id);
      if (style?.slug) {
        const slugMap = {
          'breaking-news': 'breaking-news', 'clickbait': 'clickbait-headline',
          'investigation': 'investigation', 'tech-news': 'tech-news',
          'infographic': 'news-infographic', 'professional': 'product-studio',
          'promotional': 'sale-banner',
        };
        const mapped = slugMap[style.slug];
        if (mapped) setSelectedTemplate(mapped);
      }
    }
  }, [form.style_id]);

  const filteredTemplates = templateFilter === 'all'
    ? IMAGE_TEMPLATES
    : IMAGE_TEMPLATES.filter(t => t.category === templateFilter);

  const selectedPage = pages.find(p => p.id === parseInt(form.fb_page_id));
  const selectedStyle = styles.find(s => s.id === form.style_id);

  const handleGenerate = async () => {
    if (!form.product) return alert('Vui lòng nhập tên sản phẩm trước');
    setGenLoading(true);
    try {
      const res = await generateCaption({
        product: form.product,
        style_id: form.style_id,
        prefer_model: captionModel || undefined,
      });
      setForm(f => ({ ...f, caption: res.data.data.caption, title: f.title || form.product }));
    } catch (e) { alert('Lỗi: ' + (e.response?.data?.error || e.message)); }
    setGenLoading(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImgGenResult(null);
  };

  const handleAiImageGenerate = async (overridePrompt) => {
    setImgGenLoading(true);
    setImgGenResult(null);
    setImgGenElapsed(0);
    const timer = setInterval(() => setImgGenElapsed(s => s + 1), 1000);
    const finalPrompt = overridePrompt || editablePrompt || buildPrompt(selectedTemplate, form.product);
    try {
      const res = await generateImage({
        product: form.product || form.title || 'product',
        style_id: form.style_id,
        custom_prompt: finalPrompt || undefined,
        prefer_model: imgModel || undefined,
      });
      const data = res.data.data;
      setImgGenResult(data);
      if (data.url) {
        setImagePreview(data.url);
        setForm(f => ({ ...f, image_url: data.url }));
        setImageFile(null);
      }
    } catch (e) {
      setImgGenResult({ error: e.response?.data?.error || e.message });
    }
    clearInterval(timer);
    setImgGenLoading(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview('');
    setImgGenResult(null);
    setForm(f => ({ ...f, image_url: '' }));
    setAutoGenTriggered(false);
  };

  const handleSave = async (status, publishAction = null) => {
    if (!form.title || !form.caption) return toast.warning('Cần có tiêu đề và nội dung');
    if (!form.fb_page_id) return toast.warning('Vui lòng chọn page để đăng bài');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('caption', form.caption);
      fd.append('status', status);
      fd.append('fb_page_id', form.fb_page_id);
      if (form.style_id) fd.append('style_id', form.style_id);
      if (form.scheduled_at) fd.append('scheduled_at', form.scheduled_at);
      if (imageFile) fd.append('image', imageFile);
      else if (form.image_url) fd.append('image_url', form.image_url);
      const res = await createPost(fd);
      const postId = res.data.data.id;

      // Sau khi lưu → thực hiện action nếu có
      if (publishAction === 'publish_now') {
        await publishPost(postId);
        toast.success('Đã đăng bài thành công lên Facebook!');
      } else if (publishAction === 'publish_draft') {
        await publishDraft(postId);
        toast.success('Đã đăng nháp lên Facebook! Bài sẽ nằm trong mục "Đã lên lịch" trên Page.');
      } else if (publishAction === 'publish_scheduled' && form.scheduled_at) {
        await publishScheduled(postId, form.scheduled_at);
        toast.success(`Đã hẹn giờ đăng lúc ${new Date(form.scheduled_at).toLocaleString('vi-VN')}`);
      } else {
        toast.info('Đã lưu bài viết vào hệ thống');
      }

      nav('/posts');
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message;
      toast.error(`Lỗi: ${errMsg}`);
    }
    setSaving(false);
  };

  const activePages = pages.filter(p => p.is_active);

  return (
    <div className="create-page animate-in">
      <div className="page-header"><div><h1>Tạo bài viết mới</h1><p className="page-subtitle">Sử dụng AI để tạo nội dung tự động</p></div></div>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} onClick={() => setStep(i)}>{s}</div>
        ))}
      </div>

      <div className="card step-content">
        {/* Step 0: Style */}
        {step === 0 && (
          <div>
            <h3>Chọn phong cách bài viết</h3>
            <div className="style-grid">
              {styles.map(s => (
                <div key={s.id} className={`style-card ${form.style_id === s.id ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, style_id: s.id }))} style={{ '--sc': s.color }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.color + '20', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '1.1rem' }}>{s.icon || '✦'}</div>
                  <div className="style-card-name">{s.name}</div>
                  <div className="style-card-desc">{s.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Content */}
        {step === 1 && (
          <div>
            <h3>Nội dung bài viết</h3>
            <div className="form-group"><label>Tên sản phẩm / chủ đề</label><input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="VD: iPhone 16 Pro Max" /></div>
            <div className="form-group"><label>Tiêu đề</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Tiêu đề bài viết" /></div>
            <div className="form-group">
              <label>Nội dung (Caption)</label>
              <div className="ai-generate-bar">
                {aiModels.caption.length > 0 && (
                  <select className="model-select" value={captionModel} onChange={e => setCaptionModel(e.target.value)}>
                    {aiModels.caption.map(m => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                  </select>
                )}
                <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={genLoading}>
                  {genLoading ? <><Loader size={14} className="spin-icon" /> Đang tạo...</> : <><Sparkles size={14} /> AI Tạo caption</>}
                </button>
              </div>
              <textarea rows={6} value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Nội dung sẽ hiển thị trên Facebook..." />
            </div>
          </div>
        )}

        {/* Step 2: Image — With Templates */}
        {step === 2 && (
          <div>
            <h3><ImagePlus size={20} /> Hình ảnh</h3>

            {/* === MẪU ẢNH === */}
            <div className="img-tpl-section">
              <div className="img-tpl-header">
                <LayoutGrid size={16} />
                <span>Chọn mẫu ảnh</span>
                <div className="img-tpl-filters">
                  {[
                    { id: 'all', label: 'Tất cả' },
                    { id: 'news', label: '📰 Tin tức' },
                    { id: 'product', label: '📦 Sản phẩm' },
                    { id: 'custom', label: '✏️ Tuỳ chỉnh' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`img-tpl-filter ${templateFilter === f.id ? 'active' : ''}`}
                      onClick={() => setTemplateFilter(f.id)}
                    >{f.label}</button>
                  ))}
                </div>
              </div>
              <div className="img-tpl-grid">
                {filteredTemplates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`img-tpl-card ${selectedTemplate === t.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedTemplate(t.id); setAutoGenTriggered(false); }}
                    title={t.desc}
                  >
                    <span className="img-tpl-icon">{t.icon}</span>
                    <span className="img-tpl-name">{t.name}</span>
                  </button>
                ))}
              </div>
              <p className="img-tpl-desc">
                {IMAGE_TEMPLATES.find(t => t.id === selectedTemplate)?.desc}
              </p>
            </div>

            {/* === PROMPT PREVIEW / EDITOR === */}
            <div className="img-prompt-area">
              <div className="img-prompt-header">
                <span>Prompt tạo ảnh</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowPromptEditor(v => !v)}>
                  <Edit3 size={13} /> {showPromptEditor ? 'Thu gọn' : 'Chỉnh sửa prompt'}
                </button>
              </div>
              {showPromptEditor || selectedTemplate === 'custom' ? (
                <textarea
                  className="img-prompt-textarea"
                  rows={3}
                  value={editablePrompt}
                  onChange={e => { setEditablePrompt(e.target.value); if (selectedTemplate !== 'custom') setSelectedTemplate('custom'); }}
                  placeholder="Nhập mô tả chi tiết ảnh bạn muốn tạo..."
                />
              ) : (
                <div className="img-prompt-preview" onClick={() => setShowPromptEditor(true)}>
                  {editablePrompt || <span style={{ color: 'var(--text-muted)' }}>Chưa có prompt — chọn mẫu ảnh ở trên</span>}
                </div>
              )}
            </div>

            {/* === MODEL + GENERATE BUTTON === */}
            <div className="ai-image-action-bar">
              <button className="btn btn-primary" onClick={() => handleAiImageGenerate()} disabled={imgGenLoading}>
                {imgGenLoading
                  ? <><Loader size={15} className="spin-icon" /> Đang tạo ảnh... ({imgGenElapsed}s)</>
                  : <><Wand2 size={15} /> {imagePreview ? 'Tạo lại ảnh' : 'Tạo ảnh AI'}</>
                }
              </button>
              {imgGenLoading && <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>⏳ GPT Image 2 cần 1-3 phút</span>}
              {aiModels.image.length > 0 && (
                <select className="model-select" value={imgModel} onChange={e => setImgModel(e.target.value)}>
                  {aiModels.image.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                  ))}
                </select>
              )}
            </div>

            {/* === LOADING === */}
            {imgGenLoading && !imagePreview && (
              <div className="ai-image-generating">
                <div className="loading-spinner" style={{ width: 40, height: 40, marginBottom: 16 }} />
                <p>Đang tạo ảnh <strong>"{IMAGE_TEMPLATES.find(t => t.id === selectedTemplate)?.name}"</strong>...</p>
                <span className="ai-image-model-tag">{aiModels.image.find(m => m.id === imgModel)?.name || imgModel}</span>
              </div>
            )}

            {/* === IMAGE PREVIEW === */}
            {imagePreview && (
              <div className="image-preview-wrapper">
                <img src={imagePreview} alt="preview" className="image-preview-img" />
                <button className="image-clear-btn" onClick={clearImage} title="Xoá ảnh"><X size={16} /></button>
                {imgGenResult?.model && <span className="image-model-badge">{imgGenResult.model}</span>}
              </div>
            )}

            {/* Result message */}
            {imgGenResult?.error && (
              <div className="ai-image-error">{imgGenResult.error}</div>
            )}
            {imgGenResult?.model && !imgGenResult.error && imagePreview && (
              <div className="ai-image-success">
                ✓ Ảnh tạo bằng <strong>{imgGenResult.model}</strong> — mẫu: {IMAGE_TEMPLATES.find(t => t.id === selectedTemplate)?.name}
                {imgGenResult.revised_prompt && <p className="revised-prompt">Prompt AI: {imgGenResult.revised_prompt}</p>}
              </div>
            )}

            {aiModels.image.length === 0 && !imgGenLoading && (
              <div className="ai-image-no-key">
                <Wand2 size={20} />
                <p>Chưa có API key AI nào được cấu hình</p>
                <a href="/settings" className="btn btn-primary btn-sm">Cài đặt API key →</a>
              </div>
            )}

            {/* Upload or URL — fallback */}
            <div className="image-alt-section">
              <div className="image-alt-divider"><span>hoặc tải ảnh có sẵn</span></div>
              <div className="image-alt-row">
                <label className="btn btn-secondary btn-sm" htmlFor="img-upload">
                  <Upload size={14} /> Tải ảnh lên
                  <input type="file" id="img-upload" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                </label>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <input value={form.image_url} onChange={e => { setForm(f => ({ ...f, image_url: e.target.value })); if (e.target.value) { setImagePreview(e.target.value); setImageFile(null); } }} placeholder="Dán link ảnh https://..." />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div>
            <h3>Xem trước & Chọn Page</h3>

            <div className="form-group page-selector-group">
              <label><Globe size={14} /> Đăng lên Page</label>
              {activePages.length === 0 ? (
                <div className="page-selector-empty">
                  Chưa có page nào. <a href="/pages">Thêm page →</a>
                </div>
              ) : (
                <div className="page-selector-grid">
                  {activePages.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`page-selector-item ${parseInt(form.fb_page_id) === p.id ? 'selected' : ''}`}
                      onClick={() => setForm(f => ({ ...f, fb_page_id: p.id }))}
                      style={{ '--psc': p.color }}
                    >
                      <span className="ps-avatar" style={{ borderColor: p.color }}>
                        {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <span style={{ color: p.color }}>{p.name.charAt(0)}</span>}
                      </span>
                      <span className="ps-name">{p.name}</span>
                      {parseInt(form.fb_page_id) === p.id && <span className="ps-check">✓</span>}
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
              <div className="fb-preview-caption">{form.caption || 'Nội dung bài viết...'}</div>
              {(imagePreview || form.image_url) && <img className="fb-preview-image" src={imagePreview || form.image_url} alt="" />}
            </div>
            <div className="schedule-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label><Clock size={14} /> Lên lịch đăng</label>
                <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="wizard-actions">
        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(s => s - 1)}><ChevronLeft size={16} /> Quay lại</button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {step === 3 ? (<>
            <button className="btn btn-secondary" onClick={() => handleSave('draft')} disabled={saving} title="Lưu nháp vào hệ thống (không đăng)">
              <FileText size={15} /> Lưu nháp
            </button>
            <button className="btn btn-info" onClick={() => handleSave('draft', 'publish_draft')} disabled={saving} title="Đăng nháp lên Facebook (chỉ admin page thấy)">
              <Eye size={15} /> Nháp FB
            </button>
            {form.scheduled_at && (
              <button className="btn btn-warning" onClick={() => handleSave('scheduled', 'publish_scheduled')} disabled={saving} title="Hẹn giờ đăng trực tiếp trên Facebook">
                <CalendarClock size={15} /> Hẹn giờ FB
              </button>
            )}
            <button className="btn btn-success" onClick={() => handleSave('draft', 'publish_now')} disabled={saving} title="Đăng ngay lên Facebook">
              <Send size={15} /> Đăng ngay
            </button>
          </>) : (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Tiếp theo <ChevronRight size={16} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
