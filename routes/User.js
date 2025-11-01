const express = require('express');
const router  = express.Router();

const userController = require('../controllers/User');

const { IsLogged } = require('../middlewares/IsLogged');

router.patch('/me', IsLogged, userController.updateProfile);

module.exports = router;