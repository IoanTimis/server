const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

const Review = sequelize.define('reviews', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  scope: { type: DataTypes.STRING, allowNull: true },
  guidelines: { type: DataTypes.TEXT('long'), allowNull: true },
  meta: { type: DataTypes.JSON, allowNull: true },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

const ReviewFinding = require('./review_finding');

Review.hasMany(ReviewFinding, { foreignKey: 'review_id', as: 'findings', onDelete: 'CASCADE' });
ReviewFinding.belongsTo(Review, { foreignKey: 'review_id', as: 'review', onDelete: 'CASCADE' });

module.exports = Review;
