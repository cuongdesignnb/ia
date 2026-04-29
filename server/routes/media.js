import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { MediaFile, MediaFolder } from '../models/index.js';
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

// ============================
// Multer config
// ============================
const MEDIA_BASE = path.join(__dirname, '..', '..', 'uploads', 'media');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const dir = path.join(MEDIA_BASE, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|mp4|webm)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported'));
    }
  },
});

// ============================
// Helper: create thumbnail
// ============================
async function createThumbnail(filePath, destDir) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const thumbName = `thumb_${base}${ext === '.svg' ? '.png' : ext}`;
  const thumbPath = path.join(destDir, thumbName);

  try {
    await sharp(filePath)
      .resize(300, 300, { fit: 'cover' })
      .toFile(thumbPath);
    return thumbPath;
  } catch {
    return null;
  }
}

// ============================
// Upload file(s)
// ============================
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    const { folder_id, story_id } = req.body;
    const results = [];

    for (const file of req.files) {
      // Get image dimensions
      let width = null, height = null;
      try {
        const meta = await sharp(file.path).metadata();
        width = meta.width;
        height = meta.height;
      } catch { /* not an image or sharp can't read */ }

      // Create thumbnail
      const thumbFullPath = await createThumbnail(file.path, path.dirname(file.path));

      // Relative paths
      const relativePath = '/' + path.relative(path.join(__dirname, '..', '..'), file.path).replace(/\\/g, '/');
      const thumbRelative = thumbFullPath
        ? '/' + path.relative(path.join(__dirname, '..', '..'), thumbFullPath).replace(/\\/g, '/')
        : null;

      const record = await MediaFile.create({
        folder_id: folder_id || null,
        story_id: story_id || null,
        filename: file.filename,
        original_name: file.originalname,
        mime_type: file.mimetype,
        path: relativePath,
        thumbnail_path: thumbRelative,
        size: file.size,
        width,
        height,
        uploaded_by: 'user',
      });

      results.push(record);
    }

    res.json({ success: true, files: results });
  } catch (err) {
    console.error('Media upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================
// List files (with search, filter, pagination)
// ============================
router.get('/files', async (req, res) => {
  try {
    const { folder_id, search, page = 1, limit = 40, story_id } = req.query;
    const where = {};

    if (folder_id) where.folder_id = folder_id === 'null' ? null : folder_id;
    if (story_id) where.story_id = story_id;
    if (search) {
      where[Op.or] = [
        { original_name: { [Op.like]: `%${search}%` } },
        { alt_text: { [Op.like]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await MediaFile.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
      include: [{ model: MediaFolder, as: 'folder', attributes: ['id', 'name'] }],
    });

    res.json({
      success: true,
      files: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================
// Get single file
// ============================
router.get('/files/:id', async (req, res) => {
  try {
    const file = await MediaFile.findByPk(req.params.id, {
      include: [{ model: MediaFolder, as: 'folder' }],
    });
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Update file metadata
// ============================
router.put('/files/:id', async (req, res) => {
  try {
    const file = await MediaFile.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const { alt_text, tags, folder_id, license_type, author, attribution_text } = req.body;
    await file.update({
      ...(alt_text !== undefined && { alt_text }),
      ...(tags !== undefined && { tags }),
      ...(folder_id !== undefined && { folder_id }),
      ...(license_type !== undefined && { license_type }),
      ...(author !== undefined && { author }),
      ...(attribution_text !== undefined && { attribution_text }),
    });

    res.json({ success: true, file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Delete file
// ============================
router.delete('/files/:id', async (req, res) => {
  try {
    const file = await MediaFile.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Delete physical files
    const basePath = path.join(__dirname, '..', '..');
    const filePath = path.join(basePath, file.path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (file.thumbnail_path) {
      const thumbPath = path.join(basePath, file.thumbnail_path);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }

    await file.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Folders CRUD
// ============================
router.get('/folders', async (req, res) => {
  try {
    const folders = await MediaFolder.findAll({
      order: [['name', 'ASC']],
      include: [{ model: MediaFolder, as: 'children', attributes: ['id', 'name', 'slug'] }],
    });
    res.json({ success: true, folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/folders', async (req, res) => {
  try {
    const { name, parent_id } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const folder = await MediaFolder.create({ name, slug, parent_id: parent_id || null });
    res.json({ success: true, folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/folders/:id', async (req, res) => {
  try {
    const folder = await MediaFolder.findByPk(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const { name } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await folder.update({ name, slug });
    res.json({ success: true, folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/folders/:id', async (req, res) => {
  try {
    const folder = await MediaFolder.findByPk(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Move files to root (null folder_id)
    await MediaFile.update({ folder_id: null }, { where: { folder_id: folder.id } });
    // Move sub-folders to root
    await MediaFolder.update({ parent_id: null }, { where: { parent_id: folder.id } });

    await folder.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
