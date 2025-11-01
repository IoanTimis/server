const express = require('express');
const app = express();
const cors = require('cors');
const frontend_url = process.env.FRONTEND_URL;
const path = require('path');

const allowedOrigins = [
    'http://localhost:3000', 
    'http://localhost:8080',
    `${frontend_url}`   
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
}));

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json());

var dotenv = require('dotenv');

if (process.env.NODE_ENV === 'production') {
    dotenv.config({ path: '.env.production' });
} else {
    dotenv.config({ path: '.env.local' });
}

const bcrypt = require('bcryptjs');

const cookieParser = require('cookie-parser');
app.use(cookieParser());

const sequelize = require('./config/Database');
// Ensure models are loaded so Sequelize is aware of them before sync()
// If a model file is not required somewhere else before this point, its table won't be created during sync.
require('./models/user');
require('./models/resource');
require('./models/resource_image');
require('./models/resource_feature');
require('./models/resource_coordinate');
require('./models/resource_item');
require('./models/resource_commentary');
require('./models/reset_password_token');
require('./models/review');
require('./models/review_finding');


// at first run you can set force true to make sure tables are created, might need to create the database first (make sure is the same name as in .env file)
// after that set it to false to avoid dropping existing tables,
sequelize.sync({ force: false, logging: console.log }) // Use force: false to avoid dropping existing tables
    .then(() => {
        console.log('Database & tables created!');
    })
    .catch(error => {
        console.error('Error creating database:', error);
    });

const adminRoutes = require('./routes/Admin');
app.use('/admin', adminRoutes);

const authRoutes = require('./routes/Auth');
app.use('/auth', authRoutes);

const userRoutes = require('./routes/User.js');
app.use('/users', userRoutes);

// Resource/public routes
const resourceRoutes = require('./routes/Resource');
app.use('/', resourceRoutes);

// Mailer & password reset routes
const { createMailer } = require('./config/Mailer');
app.locals.mailer = createMailer();
const passwordResetRoutes = require('./routes/PasswordReset.js');
app.use('/password', passwordResetRoutes);

// Code Review routes
const reviewRoutes = require('./routes/Review');
app.use('/review', reviewRoutes);

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(8082, () => {
    console.log('Server is running on port 8082');
});
