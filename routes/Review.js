const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/Review');
const Review = require('../models/review');
const ReviewFinding = require('../models/review_finding');
const { IsLogged } = require('../middlewares/IsLogged');

// Analyze provided files (in-body)
router.post('/analyze', IsLogged, ReviewController.analyzeFiles);

// Analyze staged changes (incremental review)
router.post('/staged', IsLogged, ReviewController.analyzeStaged);

// Analyze a repository path (basic, filtered)
router.post('/repo', IsLogged, ReviewController.analyzeRepo);

// Get default guideline text (public)
router.get('/guidelines', ReviewController.getGuidelines);

// List latest reviews with counts (scoped to current user)
router.get('/latest', IsLogged, async (req, res) => {
	try {
		const userId = req.user?.id;
		const role = req.user?.role;
		const where = role === 'admin' ? {} : { user_id: userId };
		const rows = await Review.findAll({
			where,
			order: [['createdAt', 'DESC']],
			limit: 50,
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

// Get single review by id, including findings (scoped to current user)
router.get('/:id', IsLogged, async (req, res) => {
	try {
		const id = parseInt(req.params.id, 10);
		const review = await Review.findByPk(id, { include: [{ model: ReviewFinding, as: 'findings' }] });
		if (!review) return res.status(404).json({ error: 'Not found' });

		const userId = req.user?.id;
		const role = req.user?.role;
		if (role !== 'admin' && review.user_id !== userId) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		res.json(review);
	} catch (e) {
		res.status(500).json({ error: 'Failed to load review', details: String(e?.message || e) });
	}
});

module.exports = router;
