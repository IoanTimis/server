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

// Resources (admin)
router.get('/resources', adminController.getProducts);
router.get('/resources/:id', adminController.getProduct);
router.post('/resources/', adminController.addProduct);
router.put('/resources/:id', adminController.editProduct);
router.delete('/resources/:id', adminController.deleteProduct);

module.exports = router;

