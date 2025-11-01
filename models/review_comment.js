const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

// Stores discussion threads and resolution actions for individual findings
// action: 'comment' | 'resolve' | 'reopen'
const ReviewComment = sequelize.define('review_comments', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  review_id: { type: DataTypes.INTEGER, allowNull: false },
  finding_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  action: { type: DataTypes.ENUM('comment','resolve','reopen'), allowNull: false, defaultValue: 'comment' },
  text: { type: DataTypes.TEXT('long'), allowNull: true },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

module.exports = ReviewComment;
