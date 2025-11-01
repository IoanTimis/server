const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

const ResourceImage = sequelize.define('resource_images', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'resources',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  url: {
    type: DataTypes.STRING(2048),
    allowNull: false,
  },
  alt: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = ResourceImage;