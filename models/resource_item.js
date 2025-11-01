const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

const ResourceItem = sequelize.define('resource_items', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'resources', key: 'id' },
    onDelete: 'CASCADE',
  },
  name: { type: DataTypes.STRING(255), allowNull: false },
  quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  indexes: [
    { fields: ['resource_id'] },
    { fields: ['name'] },
  ],
});

module.exports = ResourceItem;
