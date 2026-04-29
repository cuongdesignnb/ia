import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const GeneratedPost = sequelize.define('GeneratedPost', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  story_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK → TrueStory',
  },
  content_job_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → ContentJob',
  },
  fb_page_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → FbPage (page sẽ đăng)',
  },
  post_body: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Nội dung bài Facebook',
  },
  hook: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Câu hook mở đầu',
  },
  image_headline: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Tiêu đề chính trên ảnh',
  },
  image_subheadline: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Dòng phụ trên ảnh',
  },
  hashtags: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  final_image_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → MediaFile (ảnh đã compose)',
  },
  status: {
    type: DataTypes.ENUM('draft', 'approved', 'published', 'rejected'),
    defaultValue: 'draft',
  },
  ai_model_used: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  published_post_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → Post (sau khi publish thành bài thật)',
  },
}, {
  tableName: 'generated_posts',
});

export default GeneratedPost;
