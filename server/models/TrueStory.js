import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TrueStory = sequelize.define('TrueStory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Tên câu chuyện (tiếng Anh gốc)',
  },
  title_vi: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Tên câu chuyện tiếng Việt',
  },
  slug: {
    type: DataTypes.STRING(500),
    allowNull: true,
    unique: true,
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Tóm tắt câu chuyện',
  },
  event_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  location: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  verified_facts: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of verified facts',
  },
  source_urls: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of source URLs',
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'survival, science, history, nature, humanity...',
  },
  status: {
    type: DataTypes.ENUM('draft', 'verified', 'rejected'),
    defaultValue: 'draft',
  },
  used_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Số lần đã dùng để tạo bài (tránh trùng)',
  },
}, {
  tableName: 'true_stories',
});

export default TrueStory;
