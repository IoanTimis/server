const express = require('express');

const router  = express.Router(); 

const { isAdmin } = require('../middlewares/Admin');

router.use([isAdmin]);

const adminController = require('../controllers/Admin'); 

router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users/', adminController.addUser);
router.put('/users/:id', adminController.editUser);
router.delete('/users/:id', adminController.deleteUser);


module.exports = router;

