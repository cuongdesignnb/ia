import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  caption: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
  },
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  image_source: {
    type: DataTypes.ENUM('ai_generated', 'uploaded', 'url'),
    defaultValue: 'ai_generated',
  },
  style_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  fb_page_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Facebook Page mà bài viết này thuộc về',
  },
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'),
    defaultValue: 'draft',
  },
  // Loại publish: internal (hệ thống tự đăng), fb_draft (nháp trên FB), fb_scheduled (hẹn giờ FB)
  publish_type: {
    type: DataTypes.ENUM('direct', 'fb_draft', 'fb_scheduled', 'internal_scheduled'),
    defaultValue: 'direct',
    comment: 'direct=đăng ngay, fb_draft=nháp FB, fb_scheduled=hẹn giờ FB, internal_scheduled=hẹn giờ nội bộ',
  },
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  fb_post_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Facebook post ID after publishing',
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Số lần retry khi publish lỗi',
  },
  ai_model_used: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Extra data: hashtags, product info, etc.',
  },
}, {
  tableName: 'posts',
});

export default Post;
