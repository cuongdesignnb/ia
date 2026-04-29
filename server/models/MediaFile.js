import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MediaFile = sequelize.define('MediaFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  folder_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → MediaFolder',
  },
  story_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → TrueStory (nếu ảnh thuộc câu chuyện)',
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Tên file trên disk (uuid.ext)',
  },
  original_name: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Tên file gốc khi upload',
  },
  mime_type: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  path: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Đường dẫn relative: /uploads/media/2026/04/xxx.jpg',
  },
  thumbnail_path: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Thumbnail nhỏ cho grid view',
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'File size in bytes',
  },
  width: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  height: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  alt_text: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Mô tả ảnh',
  },
  source_url: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'URL gốc nếu download từ internet',
  },
  license_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'CC BY, Public Domain, Unsplash, Custom...',
  },
  author: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  attribution_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of tags for search',
  },
  uploaded_by: {
    type: DataTypes.ENUM('user', 'system', 'auto_story'),
    defaultValue: 'user',
  },
}, {
  tableName: 'media_files',
});

export default MediaFile;
