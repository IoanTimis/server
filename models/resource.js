const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

// Generic base entity for the template: Resource
const Resource = sequelize.define('resources', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
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

// Associate to User (owner)
const User = require('./user');
const ResourceImage = require('./resource_image');
const ResourceFeature = require('./resource_feature');
const ResourceItem = require('./resource_item');
const ResourceCommentary = require('./resource_commentary');

Resource.belongsTo(User, { foreignKey: 'user_id', as: 'owner', onDelete: 'CASCADE' });
User.hasMany(Resource, { foreignKey: 'user_id', as: 'resources', onDelete: 'CASCADE' });

// Images association (one-to-many)
Resource.hasMany(ResourceImage, { foreignKey: 'resource_id', as: 'images', onDelete: 'CASCADE' });
ResourceImage.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource', onDelete: 'CASCADE' });

// Features association (one-to-many)
Resource.hasMany(ResourceFeature, { foreignKey: 'resource_id', as: 'features', onDelete: 'CASCADE' });
ResourceFeature.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource', onDelete: 'CASCADE' });

// Items association (one-to-many)
Resource.hasMany(ResourceItem, { foreignKey: 'resource_id', as: 'items', onDelete: 'CASCADE' });
ResourceItem.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource', onDelete: 'CASCADE' });

// Comments association (one-to-many)
Resource.hasMany(ResourceCommentary, { foreignKey: 'resource_id', as: 'comments', onDelete: 'CASCADE' });
ResourceCommentary.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource', onDelete: 'CASCADE' });

// Comment belongs to User
ResourceCommentary.belongsTo(User, { foreignKey: 'user_id', as: 'author', onDelete: 'CASCADE' });
User.hasMany(ResourceCommentary, { foreignKey: 'user_id', as: 'resource_comments', onDelete: 'CASCADE' });

module.exports = Resource;
