const express = require('express');
const router  = express.Router(); 
const axios = require('axios');

const { isVendor } = require('../middlewares/Vendor');
const { isAdmin } = require('../middlewares/Admin');
const { reindexAllResources } = require('../utils/opensearch');
const { IsLogged } = require('../middlewares/IsLogged');

const resourceController = require('../controllers/Resource');

// Resource routes
// Viewing: accessible by vendor or client
router.get('/resources', resourceController.getResourcesFiltered);
router.get('/resources/suggest', resourceController.getResourceSuggestions);
router.get('/resources/all', resourceController.getResources);
router.get('/resources/:id', resourceController.getResourceById);


// Creation and management: vendor only
const { upload } = require('../middlewares/Upload');
router.post('/resources', isVendor, upload.array('images', 10), resourceController.createResource);
router.put('/resources/:id', isVendor, upload.array('images', 10), resourceController.updateResource);
router.delete('/resources/:id', isVendor, resourceController.deleteResource);

// Resource Items (nested)
router.get('/resources/:id/items', resourceController.listResourceItems);
router.post('/resources/:id/items', isVendor, resourceController.createResourceItem);
router.put('/resources/:id/items/:itemId', isVendor, resourceController.updateResourceItem);
router.delete('/resources/:id/items/:itemId', isVendor, resourceController.deleteResourceItem);

// Resource Comments (nested)
router.get('/resources/:id/comments', resourceController.listResourceComments);
router.post('/resources/:id/comments', IsLogged, resourceController.createResourceComment);
router.put('/resources/:id/comments/:commentId', IsLogged, resourceController.updateResourceComment);
router.delete('/resources/:id/comments/:commentId', IsLogged, resourceController.deleteResourceComment);


// test external API routes
router.get('/external-api/test', (req, res) => {

    axios.get('http://localhost:3001/api/hello', { headers: {
        'Authorization': `${process.env.API_KEY}`
    }})
        .then(response => {
            res.json({ data: response.data });
        })
        .catch(error => {
            console.error('Error fetching from external API:', error.message);
            res.status(500).json({ error: 'Failed to fetch from external API' });
        });
});

// Admin-only utilities
router.post('/resources/reindex-all', isAdmin, async (req, res) => {
    try {
        const result = await reindexAllResources();
        if (!result.success) return res.status(500).json(result);
        return res.json({ success: true, count: result.count || 0 });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
