import { useState } from 'react';
import { Zap, Lock, Eye, EyeOff, Loader } from 'lucide-react';
import { authLogin } from '../utils/api';
import './LoginPage.css';

export default function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await authLogin(password);
      const token = res.data.data.token;
      localStorage.setItem('ia_token', token);
      onLogin(token);
    } catch (err) {
      setError(err.response?.data?.error || 'Đã xảy ra lỗi kết nối');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="login-brand-icon"><Zap size={28} /></div>
          <h1>IA Creator</h1>
          <p>Đăng nhập để quản lý hệ thống</p>
        </div>

        <div className="form-group">
          <label><Lock size={14} /> Mật khẩu</label>
          <div className="input-with-icon">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              autoFocus
            />
            <button type="button" className="input-icon-btn" onClick={() => setShowPw(v => !v)}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="btn btn-primary login-btn" disabled={loading || !password.trim()}>
          {loading ? <><Loader size={16} className="spin-icon" /> Đang đăng nhập...</> : 'Đăng nhập'}
        </button>

        <p className="login-hint">Mật khẩu mặc định: <code>admin123</code></p>
      </form>
    </div>
  );
}
