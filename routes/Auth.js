const express = require('express');
const router  = express.Router();

const authController = require('../controllers/Auth');

const { NotLogged } = require('../middlewares/NotLogged');
const { IsLogged } = require('../middlewares/IsLogged');

router.post('/register', NotLogged, authController.register);
router.post('/login', NotLogged, authController.login);

router.get('/check-session', authController.checkSession);

router.post('/refresh', authController.refreshAccessToken);

router.post('/logout', IsLogged, authController.logout);

router.post('/forgot-password', NotLogged, authController.forgotPassword);
router.post('/change-password', IsLogged, authController.changePassword);

module.exports = router;
