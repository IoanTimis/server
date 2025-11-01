const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  const useSSL = url.searchParams.get("ssl") === "true";
  
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "mysql",
    dialectOptions: useSSL ? {
      ssl: {
        rejectUnauthorized: true
      }
    } : {},
  });
} else {
  sequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.DB_HOST || 'localhost', 
    port: process.env.DB_PORT || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'license',
  });
}

module.exports = sequelize;