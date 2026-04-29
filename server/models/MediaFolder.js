import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MediaFolder = sequelize.define('MediaFolder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK → MediaFolder (self-ref for nesting)',
  },
}, {
  tableName: 'media_folders',
});

export default MediaFolder;
