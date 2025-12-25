const fs = require('fs');
const path = require('path');
const util = require('util');

class Logger {
    constructor(logDir) {
        this.logDir = logDir;
        this.logFile = path.join(logDir, 'console.log');
        this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
        this.originalStdout = process.stdout.write.bind(process.stdout);
        this.originalStderr = process.stderr.write.bind(process.stderr);
    }

    log(message, ...args) {
        const formatted = util.format(message, ...args) + '\n';
        this.stream.write(formatted);
        this.originalStdout(formatted);
    }

    error(message, ...args) {
        const formatted = util.format(message, ...args) + '\n';
        this.stream.write(formatted);
        this.originalStderr(formatted);
    }

    close() {
        this.stream.end();
    }
}

module.exports = Logger;
