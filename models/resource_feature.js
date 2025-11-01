const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

const ALLOWED_FEATURE_NAMES = ['surface', 'level', 'new'];

const ResourceFeature = sequelize.define('resource_features', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'resources', key: 'id' },
    onDelete: 'CASCADE',
  },
  name: { 
    type: DataTypes.ENUM(...ALLOWED_FEATURE_NAMES), 
    allowNull: false 
  },
  value: { 
    type: DataTypes.STRING(255), 
    allowNull: false 
  },
  createdAt: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  updatedAt: { type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
}, {
  indexes: [
    { fields: ['resource_id'] },
    { fields: ['name'] },
    { unique: true, fields: ['resource_id', 'name'] },
  ],
});

module.exports = ResourceFeature;
module.exports.ALLOWED_FEATURE_NAMES = ALLOWED_FEATURE_NAMES;
