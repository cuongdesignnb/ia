import { useState, useEffect, useCallback, useRef } from 'react';
import { Image, Upload, FolderPlus, Search, Trash2, Edit3, Save, X, Download } from 'lucide-react';
import { useToast } from '../components/Toast';
import { uploadMedia, getMediaFiles, getMediaFolders, createMediaFolder, deleteMediaFile, updateMediaFile } from '../utils/api';
import './MediaLibraryPage.css';

export default function MediaLibraryPage() {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingAlt, setEditingAlt] = useState('');
  const fileInputRef = useRef(null);
  const { addToast } = useToast();

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 40 };
      if (selectedFolder !== null) params.folder_id = selectedFolder || 'null';
      if (search) params.search = search;
      const res = await getMediaFiles(params);
      setFiles(res.data.files || []);
      setTotal(res.data.total || 0);
    } catch {} finally { setLoading(false); }
  }, [page, selectedFolder, search]);

  const loadFolders = useCallback(async () => {
    try {
      const res = await getMediaFolders();
      setFolders(res.data.folders || []);
    } catch {}
  }, []);

  useEffect(() => { loadFiles(); loadFolders(); }, [loadFiles, loadFolders]);

  const handleUpload = async (e) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of fileList) formData.append('files', f);
      if (selectedFolder) formData.append('folder_id', selectedFolder);
      await uploadMedia(formData);
      addToast(`Đã upload ${fileList.length} file!`, 'success');
      loadFiles();
    } catch (err) {
      addToast('Lỗi upload', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa file này?')) return;
    try {
      await deleteMediaFile(id);
      addToast('Đã xóa', 'success');
      if (selectedFile?.id === id) setSelectedFile(null);
      loadFiles();
    } catch { addToast('Lỗi xóa', 'error'); }
  };

  const handleUpdateAlt = async () => {
    if (!selectedFile) return;
    try {
      await updateMediaFile(selectedFile.id, { alt_text: editingAlt });
      addToast('Đã cập nhật!', 'success');
      setSelectedFile({ ...selectedFile, alt_text: editingAlt });
      loadFiles();
    } catch {}
  };

  const handleCreateFolder = async () => {
    const name = prompt('Tên thư mục mới:');
    if (!name) return;
    try {
      await createMediaFolder({ name, parent_id: selectedFolder || null });
      addToast('Đã tạo thư mục!', 'success');
      loadFolders();
    } catch {}
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles?.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of droppedFiles) formData.append('files', f);
      if (selectedFolder) formData.append('folder_id', selectedFolder);
      await uploadMedia(formData);
      addToast(`Đã upload ${droppedFiles.length} file!`, 'success');
      loadFiles();
    } catch {} finally { setUploading(false); }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="media-page">
      <div className="media-page-header">
        <h1><Image size={24} /> Media Library</h1>
        <div className="media-page-actions">
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleUpload} style={{ display: 'none' }} />
          <button className="btn-upload-page" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={16} /> {uploading ? 'Đang tải...' : 'Upload'}
          </button>
        </div>
      </div>

      <div className="media-page-layout">
        {/* Sidebar */}
        <div className="media-page-sidebar">
          <div className="folder-header-page">
            <span>Thư mục</span>
            <button onClick={handleCreateFolder}><FolderPlus size={14} /></button>
          </div>
          <div className={`folder-item-page ${selectedFolder === null ? 'active' : ''}`}
            onClick={() => { setSelectedFolder(null); setPage(1); }}>
            Tất cả ({total})
          </div>
          {folders.map(f => (
            <div key={f.id}>
              <div className={`folder-item-page ${selectedFolder === f.id ? 'active' : ''}`}
                onClick={() => { setSelectedFolder(f.id); setPage(1); }}>
                {f.name}
              </div>
              {f.children?.map(child => (
                <div key={child.id} className={`folder-item-page sub ${selectedFolder === child.id ? 'active' : ''}`}
                  onClick={() => { setSelectedFolder(child.id); setPage(1); }}>
                  {child.name}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="media-page-main" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
          <div className="media-page-toolbar">
            <div className="media-page-search">
              <Search size={14} />
              <input placeholder="Tìm kiếm..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>

          {loading ? (
            <div className="media-page-empty"><div className="loading-spinner" style={{ width: 24, height: 24 }} /></div>
          ) : files.length === 0 ? (
            <div className="media-page-empty">
              <Upload size={40} />
              <p>Kéo thả file hoặc click Upload</p>
            </div>
          ) : (
            <div className="media-page-grid">
              {files.map(file => (
                <div key={file.id} className={`media-page-item ${selectedFile?.id === file.id ? 'selected' : ''}`}
                  onClick={() => { setSelectedFile(file); setEditingAlt(file.alt_text || ''); }}>
                  <div className="media-page-thumb">
                    <img src={file.thumbnail_path || file.path} alt="" />
                  </div>
                  <div className="media-page-name">{file.original_name?.substring(0, 18)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedFile && (
          <div className="media-page-detail">
            <div className="detail-close" onClick={() => setSelectedFile(null)}><X size={16} /></div>
            <div className="detail-preview">
              <img src={selectedFile.path} alt="" />
            </div>
            <div className="detail-info">
              <div className="detail-field"><label>Tên:</label><span>{selectedFile.original_name}</span></div>
              <div className="detail-field"><label>Kích thước:</label><span>{selectedFile.width}×{selectedFile.height}</span></div>
              <div className="detail-field"><label>Dung lượng:</label><span>{formatSize(selectedFile.size)}</span></div>
              {selectedFile.license_type && <div className="detail-field"><label>License:</label><span>{selectedFile.license_type}</span></div>}
              {selectedFile.author && <div className="detail-field"><label>Tác giả:</label><span>{selectedFile.author}</span></div>}
              <div className="detail-field">
                <label>Mô tả:</label>
                <input value={editingAlt} onChange={e => setEditingAlt(e.target.value)} placeholder="Alt text..." />
                <button onClick={handleUpdateAlt} className="btn-save-alt"><Save size={12} /></button>
              </div>
              <div className="detail-field">
                <label>URL:</label>
                <input value={selectedFile.path} readOnly className="url-field" onClick={e => e.target.select()} />
              </div>
              <button className="btn-delete-file" onClick={() => handleDelete(selectedFile.id)}>
                <Trash2 size={14} /> Xóa file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
