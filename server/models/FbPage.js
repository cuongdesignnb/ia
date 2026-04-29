import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const FbPage = sequelize.define('FbPage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Tên hiển thị (VD: Shop ABC)',
  },
  page_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Facebook Page ID',
  },
  access_token: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Facebook Page Access Token',
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Ảnh đại diện page (từ Graph API)',
  },
  fan_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'Số followers',
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    defaultValue: '#6366f1',
    comment: 'Màu nhận diện page',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  token_status: {
    type: DataTypes.ENUM('valid', 'expired', 'error', 'unknown'),
    defaultValue: 'unknown',
    comment: 'Trạng thái token: valid, expired, error, unknown',
  },
  token_checked_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Lần cuối kiểm tra token',
  },
  last_synced: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Lần cuối đồng bộ thông tin từ Facebook',
  },
}, {
  tableName: 'fb_pages',
});

export default FbPage;
