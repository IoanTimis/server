const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

// Model for ResourceCoordinate
const ResourceCoordinate = sequelize.define('resource_coordinates', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'resources', key: 'id' },
    unique: true, // one location per resource
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false,
  },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  indexes: [
    { fields: ['resource_id'] },
    { fields: ['latitude', 'longitude'] },
  ],
});

// Associations
const Resource = require('./resource');

ResourceCoordinate.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource', onDelete: 'CASCADE' });
Resource.hasOne(ResourceCoordinate, { foreignKey: 'resource_id', as: 'coordinates', onDelete: 'CASCADE' });

module.exports = ResourceCoordinate;