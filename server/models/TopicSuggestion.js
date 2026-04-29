import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TopicSuggestion = sequelize.define('TopicSuggestion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Tên chủ đề (tiếng Anh)',
  },
  title_vi: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Tên chủ đề tiếng Việt — hiển thị trên UI',
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Tóm tắt ngắn gọn để user quyết định có pick không',
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  hint_keywords: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Gợi ý keywords để search ảnh — pipeline có thể tham khảo',
  },
  status: {
    type: DataTypes.ENUM('pending', 'picked', 'dismissed'),
    defaultValue: 'pending',
  },
  source: {
    type: DataTypes.ENUM('cron', 'manual'),
    defaultValue: 'manual',
    comment: 'cron = tự sinh hằng ngày, manual = user bấm tạo thêm',
  },
  batch_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'UUID nhóm các topic sinh cùng 1 lần',
  },
  story_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'TrueStory được tạo từ topic này (khi status=picked)',
  },
  picked_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'topic_suggestions',
  indexes: [
    { fields: ['status'] },
    { fields: ['batch_id'] },
    { fields: ['created_at'] },
  ],
});

export default TopicSuggestion;
