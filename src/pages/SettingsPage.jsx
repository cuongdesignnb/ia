import { useState, useEffect } from 'react';
import { Globe, Key, CheckCircle, XCircle, RefreshCw, Save, Eye, EyeOff, Loader, Shield, Zap, Sparkles, Lock, KeyRound } from 'lucide-react';
import { getFbStatus, healthCheck, getSettings, updateSettings, testAiConnection, authChangePassword, authLogout } from '../utils/api';
import { useToast } from '../components/Toast';
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
