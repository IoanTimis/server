const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/Review');
const Review = require('../models/review');
const ReviewFinding = require('../models/review_finding');

// Analyze provided files (in-body)
router.post('/analyze', ReviewController.analyzeFiles);

// Analyze staged changes (incremental review)
router.post('/staged', ReviewController.analyzeStaged);

// Analyze a repository path (basic, filtered)
router.post('/repo', ReviewController.analyzeRepo);

// Get default guideline text
router.get('/guidelines', ReviewController.getGuidelines);

// List latest reviews with counts
router.get('/latest', async (req, res) => {
	try {
		const rows = await Review.findAll({
			order: [['createdAt', 'DESC']],
			limit: 20,
			attributes: ['id','scope','createdAt'],
		});
		// Count findings for each review (simple per-row query to avoid extra deps)
		const withCounts = await Promise.all(rows.map(async (r) => {
			const count = await ReviewFinding.count({ where: { review_id: r.id } });
			return { id: r.id, scope: r.scope, createdAt: r.createdAt, findings: count };
		}));
		res.json({ reviews: withCounts });
	} catch (e) {
		res.status(500).json({ error: 'Failed to list reviews', details: String(e?.message || e) });
	}
});

// Get single review by id, including findings
router.get('/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id, 10);
		const review = await Review.findByPk(id, { include: [{ model: ReviewFinding, as: 'findings' }] });
		if (!review) return res.status(404).json({ error: 'Not found' });
		res.json(review);
	} catch (e) {
		res.status(500).json({ error: 'Failed to load review', details: String(e?.message || e) });
	}
});

module.exports = router;
