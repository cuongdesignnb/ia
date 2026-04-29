import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const GeneratedImage = sequelize.define('GeneratedImage', {
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
  generated_post_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → GeneratedPost',
  },
  mode: {
    type: DataTypes.ENUM('real_photo_overlay', 'ai_reference_based'),
    defaultValue: 'real_photo_overlay',
    comment: 'Chế độ A: ảnh thật + text, Chế độ B: AI reference',
  },
  source_media_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → MediaFile (ảnh gốc dùng làm nền)',
  },
  output_media_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → MediaFile (ảnh đã compose)',
  },
  text_overlay: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '{ label, headline, subheadline }',
  },
  status: {
    type: DataTypes.ENUM('draft', 'approved', 'rejected'),
    defaultValue: 'draft',
  },
}, {
  tableName: 'generated_images',
});

export default GeneratedImage;
