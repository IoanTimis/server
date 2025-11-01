const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

const Review = sequelize.define('reviews', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // Owner of the review (FK to users.id)
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  scope: { type: DataTypes.STRING, allowNull: true },
  guidelines: { type: DataTypes.TEXT('long'), allowNull: true },
  meta: { type: DataTypes.JSON, allowNull: true },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

const ReviewFinding = require('./review_finding');
const User = require('./user');

Review.hasMany(ReviewFinding, { foreignKey: 'review_id', as: 'findings', onDelete: 'CASCADE' });
ReviewFinding.belongsTo(Review, { foreignKey: 'review_id', as: 'review', onDelete: 'CASCADE' });

// optional association to user (owner)
Review.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });
User.hasMany(Review, { foreignKey: 'user_id', as: 'reviews' });

module.exports = Review;
