const { DataTypes } = require('sequelize');
const sequelize = require('../config/Database');

const ReviewFinding = sequelize.define('review_findings', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  review_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'reviews', key: 'id' } },
  file: { type: DataTypes.STRING, allowNull: true },
  lineStart: { type: DataTypes.INTEGER, allowNull: true },
  lineEnd: { type: DataTypes.INTEGER, allowNull: true },
  severity: { type: DataTypes.ENUM('info','warn','error'), allowNull: true },
  title: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT('long'), allowNull: true },
  guideline: { type: DataTypes.STRING, allowNull: true },
  recommendation: { type: DataTypes.TEXT('long'), allowNull: true },
  fixPatch: { type: DataTypes.TEXT('long'), allowNull: true },
  effortHours: { type: DataTypes.FLOAT, allowNull: true },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

module.exports = ReviewFinding;
