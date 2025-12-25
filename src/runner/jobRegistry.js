const fs = require('fs');
const path = require('path');

class JobRegistry {
    constructor() {
        this.jobs = new Map();
    }

    /**
     * Discovers jobs in the listed content directories.
     * Recursively searches for *Job.js files.
     * @param {string} rootDir 
     */
    async discover(rootDir) {
        // Simple implementation: look in src/jobs/web/demoLocalPageJob.js
        // In a real generic implementation, we would crawl directories.
        // For now, we rigidly load the known demo job as per instructions to keep it simple but extensible.

        const jobPath = path.join(rootDir, 'src', 'jobs', 'web', 'demoLocalPageJob.js');
        if (fs.existsSync(jobPath)) {
            const job = require(jobPath);
            this.jobs.set('demoLocalPage', job);
        }

        // Added manually for now as per simple design
        const watchJobPath = path.join(rootDir, 'src', 'jobs', 'web', 'watchScreenshotJob.js');
        if (fs.existsSync(watchJobPath)) {
            this.jobs.set('watchScreenshot', require(watchJobPath));
        }

        const linkJobPath = path.join(rootDir, 'src', 'jobs', 'web', 'linkCheckJob.js');
        if (fs.existsSync(linkJobPath)) {
            this.jobs.set('linkCheck', require(linkJobPath));
        }

        const rssJobPath = path.join(rootDir, 'src', 'jobs', 'web', 'rssWatchJob.js');
        if (fs.existsSync(rssJobPath)) {
            this.jobs.set('rssWatch', require(rssJobPath));
        }

        const composeJobPath = path.join(rootDir, 'src', 'jobs', 'web', 'composePostJob.js');
        if (fs.existsSync(composeJobPath)) {
            this.jobs.set('composePost', require(composeJobPath));
        }

        const discordJobPath = path.join(rootDir, 'src', 'jobs', 'notify', 'postToDiscordJob.js');
        if (fs.existsSync(discordJobPath)) {
            this.jobs.set('postToDiscord', require(discordJobPath));
        }

        const androidPingPath = path.join(rootDir, 'src', 'jobs', 'android', 'androidPingJob.js');
        if (fs.existsSync(androidPingPath)) {
            this.jobs.set('androidPing', require(androidPingPath));
        }

        const androidRecoverPath = path.join(rootDir, 'src', 'jobs', 'android', 'androidRecoverJob.js');
        if (fs.existsSync(androidRecoverPath)) {
            this.jobs.set('androidRecover', require(androidRecoverPath));
        }
    }

    getJob(name) {
        return this.jobs.get(name);
    }

    listJobs() {
        return Array.from(this.jobs.keys());
    }
}

module.exports = new JobRegistry();
