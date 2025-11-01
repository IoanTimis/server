console.log("Test cron job running");
"use strict";

// Example cron job module: counts users and logs the result.
// Scheduling and execution are handled by cronJobs/scheduler.js

const User = require("../models/user");

module.exports = {
	id: "test",
	description: "Count users and print a summary",
	// Run every minute (for demo). Change via env: CRON_TEST_SCHEDULE
	schedule: "*/1 * * * *",
	enabled: true,
	timezone: process.env.CRON_TZ || "Europe/Bucharest",
	runOnStart: false,

	/**
	 * Job runner
	 * @param {object} ctx - provided by the scheduler
	 * @param {function} ctx.logger - job-aware logger
	 */
	run: async ({ logger }) => {
		const total = await User.count().catch((e) => {
			logger("Failed to count users:", e.message);
			return null;
		});
		if (total != null) {
			logger(`Users total in DB: ${total}`);
		}
	},
};