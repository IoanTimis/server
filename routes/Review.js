const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/Review');

// Analyze provided files (in-body)
router.post('/analyze', ReviewController.analyzeFiles);

// Analyze staged changes (incremental review)
router.post('/staged', ReviewController.analyzeStaged);

// Analyze a repository path (basic, filtered)
router.post('/repo', ReviewController.analyzeRepo);

// Get default guideline text
router.get('/guidelines', ReviewController.getGuidelines);

module.exports = router;
