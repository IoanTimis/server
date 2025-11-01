const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

const ResourceCommentary = sequelize.define('resource_commentaries', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'resources', key: 'id' },
    onDelete: 'CASCADE',
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 500],
    },
  },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  indexes: [
    { fields: ['resource_id'] },
    { fields: ['user_id'] },
    { fields: ['createdAt'] },
  ],
});

module.exports = ResourceCommentary;
