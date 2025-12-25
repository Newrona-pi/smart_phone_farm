const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const configDefault = require('../../../config/config.json');

// Helper to run ADB with arguments array
function runAdbCommand(args, timeoutMs) {
    return new Promise((resolve) => {
        const child = spawn('adb', args, { env: process.env });
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut) {
                resolve({ success: false, stdout, stderr, error: 'TIMEOUT' });
            } else if (code === 0) {
                resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
            } else {
                resolve({ success: false, stdout: stdout.trim(), stderr: stderr.trim(), error: `Exit code ${code}` });
            }
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, stdout, stderr, error: err.message });
        });
    });
}

// Detailed device status check
async function getDeviceStatus(deviceId, timeoutMs) {
    const res = await runAdbCommand(['-s', deviceId, 'get-state'], timeoutMs);

    if (res.success && res.stdout === 'device') {
        const ping = await runAdbCommand(['-s', deviceId, 'shell', 'echo', 'ping'], timeoutMs);
        if (ping.success && ping.stdout.includes('ping')) return 'UP';
        return 'UNSTABLE'; // Online but ping failed (maybe hung) - Recoverable
    }

    if (res.stderr.includes('unauthorized')) return 'UNAUTHORIZED';
    if (res.stderr.includes('not found')) return 'NOT_FOUND';
    if (res.stderr.includes('offline')) return 'OFFLINE'; // Recoverable via restart?

    return 'UNKNOWN'; // Treat as NOT_FOUND mostly
}

module.exports = {
    run: async (context) => {
        const { logger, artifactsDir } = context;
        const config = configDefault.android || {};
        const devices = config.devices || [];
        const timeoutMs = (config.timeouts && config.timeouts.adbMs) || 8000;
        const REBOOT_WAIT_MS = 60000;

        logger.log(`Job: androidRecover`);

        if (devices.length === 0) {
            logger.log("No devices configured. Skipping.");
            return { message: "No devices" };
        }

        // --- PHASE 1: Detailed Pre-check ---
        logger.log(`Starting Pre-check for ${devices.length} devices...`);
        const preCheckResults = [];
        const recoverableDevices = [];
        const unrecoverableDevices = [];

        let hasUpDevices = false;

        for (const device of devices) {
            const status = await getDeviceStatus(device.id, timeoutMs);
            preCheckResults.push({ id: device.id, name: device.name, status });

            if (status === 'UP') {
                logger.log(`  [${device.name}] UP`);
                hasUpDevices = true;
            } else {
                logger.log(`  [${device.name}] DOWN (${status})`);
                if (['NOT_FOUND', 'UNAUTHORIZED', 'UNKNOWN'].includes(status)) {
                    unrecoverableDevices.push({ ...device, reason: status });
                } else {
                    // UNSTABLE or OFFLINE -> Try recovery
                    recoverableDevices.push(device);
                }
            }
        }

        fs.writeFileSync(path.join(artifactsDir, 'android_recover_precheck.json'), JSON.stringify(preCheckResults, null, 2));

        const totalFailed = recoverableDevices.length + unrecoverableDevices.length;
        if (totalFailed === 0) {
            logger.log("All devices healthy. No recovery needed.");
            return { recoveredCount: 0, unrecoveredCount: 0 };
        }

        // --- PHASE 2: Recovery Loop ---
        logger.log(`Recovery target: ${recoverableDevices.length}, Manual req: ${unrecoverableDevices.length}`);
        const recoverResults = [];

        // Log unrecoverable immediately
        for (const d of unrecoverableDevices) {
            recoverResults.push({
                id: d.id,
                name: d.name,
                success: false,
                recoveryLevel: 0,
                elapsedMs: 0,
                logs: [`Skipped recovery: State is ${d.reason} (Manual intervention required)`]
            });
        }

        // Attempt recovery for recoverable ones
        for (const device of recoverableDevices) {
            const start = Date.now();
            logger.log(`[${device.name}] Recovery sequence started...`);
            const logs = [];
            let level = 0;

            // Step 1: HOME
            logger.log(`  [Step 1] Sending HOME key...`);
            await runAdbCommand(['-s', device.id, 'shell', 'input', 'keyevent', 'KEYCODE_HOME'], timeoutMs);
            logs.push({ step: 1, cmd: 'keyevent HOME' });

            let status = await getDeviceStatus(device.id, timeoutMs);
            if (status === 'UP') {
                level = 1;
                logger.log(`    -> Recovered!`);
            } else {
                // Step 2: Restart ADB (Conditional)
                // Skip if other devices are UP to avoid disrupting them
                if (hasUpDevices) {
                    logger.log(`  [Step 2] Skipped (ADB restart unsafe while other devices are UP)`);
                    logs.push({ step: 2, cmd: 'skipped (others UP)' });
                } else {
                    logger.log(`  [Step 2] Restarting ADB server...`);
                    await runAdbCommand(['kill-server'], timeoutMs);
                    await runAdbCommand(['start-server'], timeoutMs);
                    logs.push({ step: 2, cmd: 'adb restart-server' });
                    await new Promise(r => setTimeout(r, 3000));
                }

                status = await getDeviceStatus(device.id, timeoutMs);
                if (status === 'UP') {
                    level = 2;
                    logger.log(`    -> Recovered!`);
                } else {
                    // Step 3: Reboot
                    logger.log(`  [Step 3] Rebooting device...`);
                    await runAdbCommand(['-s', device.id, 'reboot'], timeoutMs);
                    logs.push({ step: 3, cmd: 'reboot' });

                    logger.log(`    -> Waiting ${REBOOT_WAIT_MS / 1000}s for reboot...`);
                    await new Promise(r => setTimeout(r, REBOOT_WAIT_MS));

                    status = await getDeviceStatus(device.id, timeoutMs);
                    if (status === 'UP') {
                        level = 3;
                        logger.log(`    -> Recovered!`);
                    } else {
                        logger.log(`    -> Failed all steps.`);
                    }
                }
            }

            recoverResults.push({
                id: device.id,
                name: device.name,
                success: level > 0,
                recoveryLevel: level,
                elapsedMs: Date.now() - start,
                logs: logs
            });
        }

        fs.writeFileSync(path.join(artifactsDir, 'android_recover_logs.json'), JSON.stringify(recoverResults, null, 2));

        // --- PHASE 3: Post-check ---
        logger.log(`Starting Post-check...`);
        const postCheckResults = [];
        let recoveredCount = 0;
        let unrecoveredCount = 0;
        const failedDevices = [];

        // Re-evaluate ALL devices to confirm final state
        for (const device of devices) {
            const status = await getDeviceStatus(device.id, timeoutMs);
            postCheckResults.push({ id: device.id, name: device.name, status });

            const originalFailure = recoverableDevices.some(d => d.id === device.id) || unrecoverableDevices.some(d => d.id === device.id);

            if (originalFailure) {
                if (status === 'UP') {
                    recoveredCount++;
                    logger.log(`  [${device.name}] RECOVERED`);
                } else {
                    unrecoveredCount++;
                    failedDevices.push({ ...device, status });
                    logger.log(`  [${device.name}] UNRECOVERED (${status})`);
                }
            }
        }
        fs.writeFileSync(path.join(artifactsDir, 'android_recover_postcheck.json'), JSON.stringify(postCheckResults, null, 2));

        const summary = {
            totalFailedOriginal: totalFailed,
            recoveredCount,
            unrecoveredCount,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(path.join(artifactsDir, 'summary.json'), JSON.stringify(summary, null, 2));

        logger.log(`Summary: Recovered ${recoveredCount}, Failed ${unrecoveredCount}`);

        if (unrecoveredCount > 0) {
            const err = new Error(`${unrecoveredCount} devices failed to recover.`);

            // Attach device info to error
            err.deviceId = failedDevices.map(d => d.id).join(',');
            err.deviceName = failedDevices.map(d => d.name).join(',');
            err.deviceStatus = failedDevices.map(d => d.status).join(',');

            // If all failures are due to fatal states (NOT_FOUND, UNAUTHORIZED, UNKNOWN),
            // there is no point in retrying.
            const allFatal = failedDevices.every(d => ['NOT_FOUND', 'UNAUTHORIZED', 'UNKNOWN'].includes(d.status));

            if (allFatal) {
                err.noRetry = true;
                logger.log(`[androidRecover] Non-recoverable state detected. Requesting noRetry.`);
            }

            throw err;
        }

        return summary;
    }
};
