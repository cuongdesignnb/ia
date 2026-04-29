import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Style = sequelize.define('Style', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  prompt_template: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
    comment: 'Template prompt for AI caption generation with {{product}}, {{tone}} placeholders',
  },
  image_prompt_template: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Template prompt for AI image generation',
  },
  tone: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'professional',
  },
  icon: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    comment: 'Hex color for UI display',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'styles',
});

export default Style;
