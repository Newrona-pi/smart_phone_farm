const fs = require('fs');
const path = require('path');

/**
 * Finds the latest successful run for a specific job.
 * @param {string} runsDir 
 * @param {string} jobName 
 * @returns {string|null} Path to the specific run directory or null
 */
function findPreviousSuccessRun(runsDir, jobName) {
    if (!fs.existsSync(runsDir)) return null;

    // List all folders, assume YYYY-MM-DD format implies sortable by name
    const runFolders = fs.readdirSync(runsDir)
        .filter(f => fs.statSync(path.join(runsDir, f)).isDirectory())
        .sort()
        .reverse(); // Newest first

    for (const folder of runFolders) {
        const runPath = path.join(runsDir, folder);
        const runJsonPath = path.join(runPath, 'run.json');

        if (fs.existsSync(runJsonPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'));
                if (data.job === jobName && data.status === 'success') {
                    return runPath;
                }
            } catch (e) {
                // ignore corrupted json
            }
        }
    }
    return null;
}

module.exports = { findPreviousSuccessRun };
