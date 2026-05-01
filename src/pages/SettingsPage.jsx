import { useState, useEffect } from 'react';
import { Globe, Key, CheckCircle, XCircle, RefreshCw, Save, Eye, EyeOff, Loader, Shield, Zap, Sparkles, Lock, KeyRound, Bot, Clock, Image } from 'lucide-react';
import { getFbStatus, healthCheck, getSettings, updateSettings, testAiConnection, authChangePassword, authLogout } from '../utils/api';
import { useToast } from '../components/Toast';
import MediaLibrary from '../components/MediaLibrary';
import './SettingsPage.css';

export default function SettingsPage({ onLogout }) {
  const toast = useToast();
  const [fbStatus, setFbStatus] = useState(null);
  const [serverOk, setServerOk] = useState(null);
  const [settings, setSettings] = useState(null);
  const [formData, setFormData] = useState({
    openai_api_key: '',
    google_ai_api_key: '',
    fb_page_id: '',
    fb_access_token: '',
    fb_app_id: '',
    fb_app_secret: '',
  });
  const [showKeys, setShowKeys] = useState({});
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // Auto Story settings
  const [autoForm, setAutoForm] = useState({
    auto_story_enabled: 'false',
    auto_story_cron: '0 6 * * *',
    auto_stories_per_day: '3',
    auto_story_categories: '["survival","science","history","nature","humanity"]',
    auto_story_ai_model: 'gpt-5.5',
    image_label_text: 'CÂU CHUYỆN CÓ THẬT',
    image_label_color: '#ff0000',
    image_logo_position: 'top-right',
    image_logo_size: '120',
    image_logo_media_id: '',
    unsplash_api_key: '',
    topic_suggestion_enabled: 'true',
    topic_suggestion_batch_size: '5',
  });
  const [showMediaLib, setShowMediaLib] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

  // Password change
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState({ text: '', ok: false });
  const [pwSaving, setPwSaving] = useState(false);

  const loadStatus = () => {
    setServerOk(null); setFbStatus(null);
    healthCheck().then(() => setServerOk(true)).catch(() => setServerOk(false));
    getFbStatus().then(r => setFbStatus(r.data.data)).catch(() => setFbStatus({ connected: false }));
  };

  const loadSettings = async () => {
    try {
      const res = await getSettings();
      setSettings(res.data.data);
      // Load auto story settings
      const autoKeys = res.data.data?.auto_story || {};
      setAutoForm(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(autoKeys).filter(([k, v]) => v?.value).map(([k, v]) => [k, v.value])),
      }));
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    loadStatus();
    loadSettings();
  }, []);

  const handleSave = async () => {
    // Only send fields that have been filled in (not empty)
    const toSend = {};
    for (const [k, v] of Object.entries(formData)) {
      if (v.trim()) toSend[k] = v;
    }
    if (Object.keys(toSend).length === 0) {
      toast.warning('Chưa có thay đổi nào để lưu');
      return;
    }
    setSaving(true);
    try {
      await updateSettings(toSend);
      toast.success('Cài đặt đã được lưu!');
      setFormData({ openai_api_key: '', google_ai_api_key: '', fb_page_id: '', fb_access_token: '', fb_app_id: '', fb_app_secret: '' });
      loadSettings();
      loadStatus();
    } catch (err) {
      toast.error('Lỗi: ' + (err.response?.data?.error || err.message));
    }
    setSaving(false);
  };

  const handleTestAi = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection();
      setTestResult(res.data.data);
    } catch (err) {
      setTestResult({ error: err.response?.data?.error || err.message });
    }
    setTesting(false);
  };

  const handleChangePw = async (e) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ text: 'Mật khẩu xác nhận không khớp', ok: false });
      return;
    }
    setPwSaving(true);
    try {
      await authChangePassword(pwForm.current, pwForm.newPw);
      setPwMsg({ text: 'Đã đổi mật khẩu thành công!', ok: true });
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      setPwMsg({ text: err.response?.data?.error || err.message, ok: false });
    }
    setPwSaving(false);
    setTimeout(() => setPwMsg({ text: '', ok: false }), 4000);
  };

  const handleLogout = async () => {
    try { await authLogout(); } catch (e) { /* ignore */ }
    localStorage.removeItem('ia_token');
    onLogout();
  };

  const toggleShowKey = (key) => setShowKeys(v => ({ ...v, [key]: !v[key] }));

  const handleSaveAutoStory = async () => {
    setAutoSaving(true);
    try {
      await updateSettings(autoForm);
      toast.success('Đã lưu cài đặt Auto Story!');
      loadSettings();
    } catch (err) {
      toast.error('Lỗi: ' + (err.response?.data?.error || err.message));
    }
    setAutoSaving(false);
  };

  const renderKeyField = (key, label, placeholder) => {
    const info = settings?.[key.startsWith('fb_') ? 'facebook' : 'ai']?.[key];
    return (
      <div className="form-group">
        <label>{label}</label>
        <div className="key-status-row">
          {info?.configured ? (
            <span className="key-configured"><CheckCircle size={13} /> {info.masked}</span>
          ) : (
            <span className="key-not-configured"><XCircle size={13} /> Chưa cấu hình</span>
          )}
        </div>
        <div className="input-with-icon">
          <input
            type={showKeys[key] ? 'text' : 'password'}
            value={formData[key]}
            onChange={e => setFormData(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
          />
          <button type="button" className="input-icon-btn" onClick={() => toggleShowKey(key)}>
            {showKeys[key] ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="settings-page animate-in">
      <div className="page-header">
        <div><h1>Cài đặt</h1><p className="page-subtitle">Cấu hình hệ thống, API keys và kết nối</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={loadStatus}><RefreshCw size={16} /> Kiểm tra lại</button>
          <button className="btn btn-ghost" onClick={handleLogout}><Lock size={16} /> Đăng xuất</button>
        </div>
      </div>

      <div className="settings-grid">
        {/* System Status */}
        <div className="card settings-section">
          <h3><Zap size={18} /> Trạng thái hệ thống</h3>
          <div className={`api-status ${serverOk ? 'connected' : 'disconnected'}`}>
            {serverOk ? <CheckCircle size={16} /> : <XCircle size={16} />}
            Backend Server: {serverOk === null ? 'Đang kiểm tra...' : serverOk ? 'Hoạt động' : 'Không kết nối'}
          </div>
          <div className={`api-status ${fbStatus?.connected ? 'connected' : 'disconnected'}`} style={{ marginTop: 8 }}>
            {fbStatus?.connected ? <CheckCircle size={16} /> : <XCircle size={16} />}
            Facebook: {fbStatus === null ? 'Đang kiểm tra...' : fbStatus.connected ? `Đã kết nối — ${fbStatus.page?.name || ''}` : `Chưa kết nối${fbStatus.message ? ': ' + fbStatus.message : ''}`}
          </div>
        </div>

        {/* AI Keys */}
        <div className="card settings-section">
          <h3><Sparkles size={18} /> Cấu hình AI</h3>
          {renderKeyField('google_ai_api_key', 'Google AI API Key (Gemini)', 'Nhập Google AI API key mới...')}
          {renderKeyField('openai_api_key', 'OpenAI API Key', 'Nhập OpenAI API key mới...')}
          <button className="btn btn-secondary btn-sm" onClick={handleTestAi} disabled={testing} style={{ marginTop: 8 }}>
            {testing ? <><Loader size={14} className="spin-icon" /> Đang kiểm tra...</> : <><Zap size={14} /> Kiểm tra kết nối AI</>}
          </button>
          {testResult && (
            <div className="test-results">
              {testResult.error && <div className="test-item test-fail"><XCircle size={14} /> {testResult.error}</div>}
              {testResult.gemini && (
                <div className={`test-item ${testResult.gemini.ok ? 'test-pass' : 'test-fail'}`}>
                  {testResult.gemini.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  Gemini: {testResult.gemini.ok ? `Hoạt động (${testResult.gemini.model})` : testResult.gemini.error}
                </div>
              )}
              {testResult.openai && (
                <div className={`test-item ${testResult.openai.ok ? 'test-pass' : 'test-fail'}`}>
                  {testResult.openai.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  OpenAI: {testResult.openai.ok ? `Hoạt động (${testResult.openai.model})` : testResult.openai.error}
                </div>
              )}
              {!testResult.gemini && !testResult.openai && !testResult.error && (
                <div className="test-item test-fail"><XCircle size={14} /> Chưa có API key nào được cấu hình</div>
              )}
            </div>
          )}
        </div>

        {/* Facebook Keys */}
        <div className="card settings-section">
          <h3><Globe size={18} /> Cấu hình Facebook</h3>
          {renderKeyField('fb_page_id', 'Facebook Page ID', 'Nhập Page ID...')}
          {renderKeyField('fb_access_token', 'Facebook Access Token', 'Nhập Access Token mới...')}
          <div className="settings-divider" />
          <h4 style={{ margin: '0 0 8px', fontSize: '.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><KeyRound size={15} /> Cấu hình đổi Token dài hạn</h4>
          <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Lấy từ <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Meta for Developers</a> → App Settings → Basic. Cần để đổi token ngắn hạn (1-2h) → dài hạn (~60 ngày).
          </p>
          {renderKeyField('fb_app_id', 'Facebook App ID', 'Nhập App ID...')}
          {renderKeyField('fb_app_secret', 'Facebook App Secret', 'Nhập App Secret...')}
        </div>

        {/* Auto True Story */}
        <div className="card settings-section">
          <h3><Bot size={18} /> Auto True Story</h3>
          <div className="form-group">
            <label>Bật tự động tạo bài</label>
            <label className="toggle-switch">
              <input type="checkbox" checked={autoForm.auto_story_enabled === 'true'}
                onChange={e => setAutoForm(f => ({ ...f, auto_story_enabled: e.target.checked ? 'true' : 'false' }))} />
              <span className="toggle-slider"></span>
              <span className="toggle-label">{autoForm.auto_story_enabled === 'true' ? 'Đang bật' : 'Đang tắt'}</span>
            </label>
          </div>
          <div className="form-group">
            <label><Clock size={14} /> Lịch chạy (Cron expression)</label>
            <input type="text" value={autoForm.auto_story_cron}
              onChange={e => setAutoForm(f => ({ ...f, auto_story_cron: e.target.value }))}
              placeholder="0 6 * * * (mỗi ngày lúc 6:00)" />
            <small style={{ color: '#888', marginTop: 4 }}>VD: "0 6 * * *" = 6h sáng mỗi ngày, "0 6,18 * * *" = 6h + 18h</small>
          </div>
          <div className="form-group">
            <label>Số bài mỗi lần chạy</label>
            <input type="number" min="1" max="10" value={autoForm.auto_stories_per_day}
              onChange={e => setAutoForm(f => ({ ...f, auto_stories_per_day: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>AI Model mặc định</label>
            <select value={autoForm.auto_story_ai_model}
              onChange={e => setAutoForm(f => ({ ...f, auto_story_ai_model: e.target.value }))}>
              <option value="gpt-5.5">GPT-5.5 (Flagship)</option>
              <option value="gpt-5.4-mini">GPT-5.4 Mini</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            </select>
          </div>
          <div className="settings-divider" />
          <h4 style={{ margin: '0 0 12px', fontSize: '.9rem', color: '#ccc', display: 'flex', alignItems: 'center', gap: 6 }}><Image size={15} /> Branding ảnh</h4>
          <div className="form-group">
            <label>Nhãn trên ảnh</label>
            <input type="text" value={autoForm.image_label_text}
              onChange={e => setAutoForm(f => ({ ...f, image_label_text: e.target.value }))}
              placeholder="CÂU CHUYỆN CÓ THẬT" />
          </div>
          <div className="form-group">
            <label>Màu nhãn</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={autoForm.image_label_color}
                onChange={e => setAutoForm(f => ({ ...f, image_label_color: e.target.value }))} style={{ width: 40, height: 32, padding: 0, border: 'none' }} />
              <input type="text" value={autoForm.image_label_color}
                onChange={e => setAutoForm(f => ({ ...f, image_label_color: e.target.value }))} style={{ width: 100 }} />
            </div>
          </div>
          <div className="form-group">
            <label>Logo (gắn vào ảnh compose)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {autoForm.image_logo_media_id && <span className="key-configured"><CheckCircle size={13} /> ID: {autoForm.image_logo_media_id}</span>}
              <button className="btn btn-secondary btn-sm" onClick={() => setShowMediaLib(true)}><Image size={14} /> Chọn logo</button>
            </div>
          </div>
          <div className="form-group">
            <label>Vị trí logo</label>
            <select value={autoForm.image_logo_position}
              onChange={e => setAutoForm(f => ({ ...f, image_logo_position: e.target.value }))}>
              <option value="top-left">Trên trái</option>
              <option value="top-right">Trên phải</option>
              <option value="bottom-left">Dưới trái</option>
              <option value="bottom-right">Dưới phải</option>
            </select>
          </div>
          <div className="form-group">
            <label>Kích thước logo (px)</label>
            <input type="number" min="40" max="300" value={autoForm.image_logo_size}
              onChange={e => setAutoForm(f => ({ ...f, image_logo_size: e.target.value }))} />
          </div>
          <div className="settings-divider" />
          <h4 style={{ margin: '0 0 12px', fontSize: '.9rem', color: '#ccc', display: 'flex', alignItems: 'center', gap: 6 }}><Bot size={15} /> Gợi ý chủ đề (kho tích luỹ)</h4>
          <div className="form-group">
            <label>Tự động tạo gợi ý hàng ngày (06:00)</label>
            <label className="toggle-switch">
              <input type="checkbox" checked={autoForm.topic_suggestion_enabled === 'true'}
                onChange={e => setAutoForm(f => ({ ...f, topic_suggestion_enabled: e.target.checked ? 'true' : 'false' }))} />
              <span className="toggle-slider"></span>
              <span className="toggle-label">{autoForm.topic_suggestion_enabled === 'true' ? 'Đang bật cron 06:00' : 'Đã tắt — chỉ tạo khi bấm tay'}</span>
            </label>
            <small style={{ color: '#888', marginTop: 4 }}>Tắt để tiết kiệm token. Bấm "Tạo thêm gợi ý" trong Auto Content khi cần.</small>
          </div>
          <div className="form-group">
            <label>Số chủ đề mỗi lần tạo</label>
            <input type="number" min="1" max="20" value={autoForm.topic_suggestion_batch_size}
              onChange={e => setAutoForm(f => ({ ...f, topic_suggestion_batch_size: e.target.value }))} />
            <small style={{ color: '#888', marginTop: 4 }}>Áp dụng cho cả cron và bấm tay. Dùng cùng model với "AI Model mặc định" ở trên (gpt-5.5 → ~$0.05/lần, gpt-5.4-mini → ~$0.01/lần).</small>
          </div>
          <div className="settings-divider" />
          <div className="form-group">
            <label>Unsplash API Key</label>
            <div className="input-with-icon">
              <input type={showKeys['unsplash'] ? 'text' : 'password'} value={autoForm.unsplash_api_key}
                onChange={e => setAutoForm(f => ({ ...f, unsplash_api_key: e.target.value }))}
                placeholder="Unsplash Access Key..." />
              <button type="button" className="input-icon-btn" onClick={() => toggleShowKey('unsplash')}>
                {showKeys['unsplash'] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSaveAutoStory} disabled={autoSaving} style={{ marginTop: 12 }}>
            {autoSaving ? <><Loader size={14} className="spin-icon" /> Đang lưu...</> : <><Save size={14} /> Lưu Auto Story</>}
          </button>
        </div>

        <MediaLibrary isOpen={showMediaLib} onClose={() => setShowMediaLib(false)}
          onSelect={(file) => setAutoForm(f => ({ ...f, image_logo_media_id: String(file.id) }))} title="Chọn Logo" />

        {/* Save */}
        <div className="settings-save-bar">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader size={16} className="spin-icon" /> Đang lưu...</> : <><Save size={16} /> Lưu cài đặt</>}
          </button>
        </div>

        {/* Change Password */}
        <div className="card settings-section">
          <h3><Shield size={18} /> Đổi mật khẩu</h3>
          <form onSubmit={handleChangePw}>
            <div className="form-group">
              <label>Mật khẩu hiện tại</label>
              <input type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} placeholder="Nhập mật khẩu hiện tại..." />
            </div>
            <div className="form-group">
              <label>Mật khẩu mới</label>
              <input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} placeholder="Nhập mật khẩu mới..." />
            </div>
            <div className="form-group">
              <label>Xác nhận mật khẩu mới</label>
              <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Nhập lại mật khẩu mới..." />
            </div>
            {pwMsg.text && <div className={`login-error ${pwMsg.ok ? 'success' : ''}`} style={{ marginBottom: 12 }}>{pwMsg.text}</div>}
            <button type="submit" className="btn btn-secondary" disabled={pwSaving}>
              {pwSaving ? <><Loader size={14} className="spin-icon" /> Đang đổi...</> : <><Shield size={14} /> Đổi mật khẩu</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
