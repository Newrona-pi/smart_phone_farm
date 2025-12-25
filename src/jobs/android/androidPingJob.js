const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const configDefault = require('../../../config/config.json');

const execPromise = util.promisify(exec);

async function runAdbCommand(cmd, timeoutMs) {
    try {
        const { stdout, stderr } = await execPromise(cmd, { timeout: timeoutMs });
        return {
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim()
        };
    } catch (error) {
        return {
            success: false,
            stdout: error.stdout ? error.stdout.trim() : '',
            stderr: error.stderr ? error.stderr.trim() : error.message,
            error: error.message
        };
    }
}

module.exports = {
    run: async (context) => {
        const { logger, artifactsDir } = context;
        const config = configDefault.android || {};
        const devices = config.devices || [];
        const timeoutMs = (config.timeouts && config.timeouts.adbMs) || 8000;

        logger.log(`Job: androidPing`);
        logger.log(`Devices: ${devices.length}, Timeout: ${timeoutMs}ms`);

        if (devices.length === 0) {
            logger.log("No devices configured in config.json");
            return { processed: 0, distinct_status: 'no_devices' };
        }

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const device of devices) {
            const start = Date.now();
            logger.log(`[${device.name}] Checking ID: ${device.id}...`);

            // A) get-state
            const stateRes = await runAdbCommand(`adb -s ${device.id} get-state`, timeoutMs);

            // B) shell echo ping
            const pingRes = await runAdbCommand(`adb -s ${device.id} shell echo ping`, timeoutMs);

            // C) shell getprop ro.build.version.release
            const verRes = await runAdbCommand(`adb -s ${device.id} shell getprop ro.build.version.release`, timeoutMs);

            const elapsed = Date.now() - start;

            // Determine success: state must be "device" and ping stdout must contain "ping"
            const isOnline = stateRes.success && stateRes.stdout === 'device';
            const isPingOk = pingRes.success && pingRes.stdout.includes('ping');

            // Overall device status
            const isSuccess = isOnline && isPingOk;

            if (isSuccess) successCount++;
            else failCount++;

            const deviceResult = {
                id: device.id,
                name: device.name,
                success: isSuccess,
                elapsedMs: elapsed,
                details: {
                    state: stateRes,
                    ping: pingRes,
                    version: verRes
                }
            };

            results.push(deviceResult);
            const logPrefix = isSuccess ? '✅' : '❌';
            logger.log(`${logPrefix} [${device.name}] Success: ${isSuccess} (${elapsed}ms) - State: ${stateRes.stdout || 'N/A'}, Ver: ${verRes.stdout || 'N/A'}`);
        }

        // Save artifacts
        const pingJsonPath = path.join(artifactsDir, 'android_ping.json');
        fs.writeFileSync(pingJsonPath, JSON.stringify(results, null, 2));

        const summaryJsonPath = path.join(artifactsDir, 'summary.json');
        const summary = {
            total: devices.length,
            success: successCount,
            failed: failCount,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2));

        logger.log(`Summary: Success ${successCount}/${devices.length}`);

        // Allow job pass if at least 1 device succeeded
        if (successCount === 0 && devices.length > 0) {
            throw new Error('All Android devices failed ping check.');
        }

        return {
            processed: devices.length,
            successCount,
            failCount
        };
    }
};
