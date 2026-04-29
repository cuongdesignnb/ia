import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ContentJob = sequelize.define('ContentJob', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  topic: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Chủ đề gợi ý (nullable = AI tự chọn)',
  },
  job_type: {
    type: DataTypes.ENUM('auto_scheduled', 'manual'),
    defaultValue: 'manual',
  },
  status: {
    type: DataTypes.ENUM('pending', 'discovering', 'verifying', 'searching_images', 'writing', 'composing', 'completed', 'failed'),
    defaultValue: 'pending',
  },
  current_step: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_steps: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
  },
  story_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → TrueStory (set after discovery)',
  },
  generated_post_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → GeneratedPost (set after writing)',
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  finished_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'content_jobs',
});

export default ContentJob;
