import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Upload, FolderPlus, Search, Grid, Image, Check, Trash2 } from 'lucide-react';
import { uploadMedia, getMediaFiles, getMediaFolders, createMediaFolder, deleteMediaFile } from '../utils/api';
import './MediaLibrary.css';

/**
 * Media Library Modal Component
 * @param {boolean} isOpen - Show/hide
 * @param {function} onClose - Close callback
 * @param {function} onSelect - Called with selected MediaFile object
 * @param {string} title - Modal title
 */
export default function MediaLibrary({ isOpen, onClose, onSelect, title = 'Chọn ảnh' }) {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const fileInputRef = useRef(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 30 };
      if (selectedFolder !== null) params.folder_id = selectedFolder || 'null';
      if (search) params.search = search;

      const res = await getMediaFiles(params);
      setFiles(res.data.files || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Load media error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, selectedFolder, search]);

  const loadFolders = useCallback(async () => {
    try {
      const res = await getMediaFolders();
      setFolders(res.data.folders || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
      loadFolders();
    }
  }, [isOpen, loadFiles, loadFolders]);

  const handleUpload = async (e) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of fileList) formData.append('files', f);
      if (selectedFolder) formData.append('folder_id', selectedFolder);

      await uploadMedia(formData);
      loadFiles();
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSelect = (file) => {
    setSelected(file.id === selected?.id ? null : file);
  };

  const handleConfirm = () => {
    if (selected && onSelect) {
      onSelect(selected);
      onClose();
    }
  };

  const handleDelete = async (fileId, e) => {
    e.stopPropagation();
    if (!confirm('Xóa file này?')) return;
    try {
      await deleteMediaFile(fileId);
      loadFiles();
      if (selected?.id === fileId) setSelected(null);
    } catch {}
  };

  const handleCreateFolder = async () => {
    const name = prompt('Tên thư mục mới:');
    if (!name) return;
    try {
      await createMediaFolder({ name, parent_id: selectedFolder });
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
      loadFiles();
    } catch {} finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="media-overlay" onClick={onClose}>
      <div className="media-modal" onClick={e => e.stopPropagation()}>
        <div className="media-modal-header">
          <h2><Image size={20} /> {title}</h2>
          <button className="media-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="media-modal-body">
          {/* Sidebar: Folders */}
          <div className="media-sidebar">
            <div className="folder-header">
              <span>Thư mục</span>
              <button onClick={handleCreateFolder} title="Tạo thư mục"><FolderPlus size={14} /></button>
            </div>
            <div className={`folder-item ${selectedFolder === null ? 'active' : ''}`}
              onClick={() => { setSelectedFolder(null); setPage(1); }}>
              Tất cả
            </div>
            <div className={`folder-item ${selectedFolder === 0 ? 'active' : ''}`}
              onClick={() => { setSelectedFolder(0); setPage(1); }}>
              Chưa phân loại
            </div>
            {folders.map(f => (
              <div key={f.id} className={`folder-item ${selectedFolder === f.id ? 'active' : ''}`}
                onClick={() => { setSelectedFolder(f.id); setPage(1); }}>
                {f.name}
                {f.children?.map(child => (
                  <div key={child.id} className={`folder-sub ${selectedFolder === child.id ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedFolder(child.id); setPage(1); }}>
                    {child.name}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Main: Files */}
          <div className="media-main"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}>
            {/* Toolbar */}
            <div className="media-toolbar">
              <div className="media-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <div className="media-toolbar-actions">
                <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
                <button className="btn-upload" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload size={14} /> {uploading ? 'Đang tải...' : 'Upload'}
                </button>
              </div>
            </div>

            {/* Files Grid */}
            {loading ? (
              <div className="media-loading"><div className="loading-spinner" style={{ width: 24, height: 24 }} /></div>
            ) : files.length === 0 ? (
              <div className="media-empty">
                <Upload size={32} />
                <p>Chưa có file nào. Kéo thả hoặc click Upload.</p>
              </div>
            ) : (
              <div className="media-grid">
                {files.map(file => (
                  <div
                    key={file.id}
                    className={`media-item ${selected?.id === file.id ? 'selected' : ''}`}
                    onClick={() => handleSelect(file)}
                  >
                    <div className="media-thumb">
                      <img src={file.thumbnail_path || file.path} alt={file.alt_text || file.original_name} />
                      {selected?.id === file.id && <div className="media-check"><Check size={16} /></div>}
                      <button className="media-delete" onClick={(e) => handleDelete(file.id, e)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="media-name" title={file.original_name}>
                      {file.original_name?.length > 20 ? file.original_name.substring(0, 20) + '...' : file.original_name}
                    </div>
                    <div className="media-size">
                      {file.width && file.height ? `${file.width}×${file.height}` : ''}
                      {file.license_type ? ` · ${file.license_type}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {total > 30 && (
              <div className="media-pagination">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button>
                <span>Trang {page}</span>
                <button disabled={files.length < 30} onClick={() => setPage(p => p + 1)}>Sau</button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="media-modal-footer">
          {selected && (
            <div className="selected-info">
              <img src={selected.thumbnail_path || selected.path} alt="" className="selected-thumb" />
              <span>{selected.original_name}</span>
            </div>
          )}
          <div className="footer-actions">
            <button className="btn-cancel-media" onClick={onClose}>Hủy</button>
            <button className="btn-confirm-media" onClick={handleConfirm} disabled={!selected}>
              <Check size={14} /> Chọn ảnh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
