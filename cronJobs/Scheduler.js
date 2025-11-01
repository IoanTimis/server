"use strict";

var dotenv = require('dotenv');

if (process.env.NODE_ENV === 'production') {
    dotenv.config({ path: '.env.production' });
} else {
    dotenv.config({ path: '.env.local' });
}

const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const sequelize = require('../config/Database');

// Lazily load models here if you need to pass them as context
const models = {
  User: require('../models/user'),
  Resource: safeRequire('../models/resource'),
};

function safeRequire(p) {
  try { return require(p); } catch { return null; }
}

function createLogger(jobId) {
  return (...args) => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [cron:${jobId}]`, ...args);
  };
}

function loadJobs(dir) {
  const jobs = [];
  const abs = path.resolve(__dirname);
  const files = fs.readdirSync(abs).filter(f => f.endsWith('.js') && f !== 'scheduler.js' && f !== 'index.js');
  for (const file of files) {
    try {
      const mod = require(path.join(abs, file));
      if (mod && mod.id && typeof mod.run === 'function') {
        jobs.push(mod);
      }
    } catch (e) {
      console.error('Failed to load job file', file, e.message);
    }
  }
  return jobs;
}

async function start() {
  const TZ = process.env.CRON_TZ || 'Europe/Bucharest';
  process.env.TZ = TZ; // ensure default timezone for node-cron

  const jobs = loadJobs(__dirname);
  if (!jobs.length) {
    console.log('No cron jobs found in', __dirname);
  }

  const argRun = process.argv.find(a => a.startsWith('--run='));
  const runOnceId = argRun ? argRun.split('=')[1] : null;

  for (const job of jobs) {
    const enabled = job.enabled !== false;
    const schedule = job.schedule || '0 * * * *';
    const tz = job.timezone || TZ;
    const logger = createLogger(job.id);

    const ctx = { logger, sequelize, models };

    if (runOnceId && runOnceId === job.id) {
      logger(`Running once via --run for job '${job.id}'...`);
      await ensureDb();
      await job.run(ctx).catch((e) => logger('Job failed:', e));
      process.exit(0);
    }

    if (!enabled) {
      logger('Job disabled, skipping schedule.');
      continue;
    }

    if (!cron.validate(schedule)) {
      logger(`Invalid cron expression: '${schedule}', skipping.`);
      continue;
    }

    cron.schedule(schedule, async () => {
      logger('Started');
      try {
        await ensureDb();
        await job.run(ctx);
        logger('Completed');
      } catch (e) {
        logger('Error:', e && e.stack ? e.stack : e);
      }
    }, { timezone: tz });

    logger(`Scheduled at '${schedule}' (${tz})${job.runOnStart ? ' + runOnStart' : ''}`);

    if (job.runOnStart) {
      (async () => {
        logger('Run on start');
        try {
          await ensureDb();
          await job.run(ctx);
          logger('Run on start completed');
        } catch (e) {
          logger('Run on start error:', e);
        }
      })();
    }
  }
}

async function ensureDb() {
  try {
    await sequelize.authenticate();
  } catch (e) {
    console.error('[cron] DB auth failed:', e.message);
  }
}

start();
