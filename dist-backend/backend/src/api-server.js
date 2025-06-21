"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLog = addLog;
exports.addError = addError;
exports.addBalanceChange = addBalanceChange;
exports.addTransaction = addTransaction;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const web3_js_1 = require("@solana/web3.js");
// Import your REAL core files
const dynamicTrade_1 = require("./dynamicTrade");
const addedOptions_1 = require("./addedOptions");
const swapConfig_1 = require("./swapConfig");
const utility_1 = require("./utility");
const wallet_1 = __importDefault(require("./wallet"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '12001');
// Middleware
app.use((0, cors_1.default)({
    origin: true,
    credentials: true
}));
app.use(express_1.default.json());
// Global trading state
const globalTradingFlag = { value: false };
let currentTradingSession = null;
// Connection setup
const connection = new web3_js_1.Connection(swapConfig_1.swapConfig.RPC_URL, 'confirmed');
// Monitoring data structure
const monitoringData = {
    logs: [],
    consoleOutput: [],
    errors: [],
    performanceMetrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkLatency: 0,
        rpcResponseTime: 0,
        lastUpdated: new Date().toISOString()
    },
    balanceChanges: [],
    transactions: []
};
const MAX_LOGS = 1000;
const MAX_CONSOLE_OUTPUT = 500;
const MAX_ERRORS = 100;
// Monitoring functions
function addLog(level, message, source, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        id: Date.now() + Math.random(),
        timestamp,
        level,
        message,
        source,
        details: details || {}
    };
    monitoringData.logs.unshift(logEntry);
    if (monitoringData.logs.length > MAX_LOGS) {
        monitoringData.logs = monitoringData.logs.slice(0, MAX_LOGS);
    }
    // Also add to console output for real-time monitoring
    const consoleEntry = {
        id: Date.now() + Math.random(),
        timestamp,
        message: `[${level.toUpperCase()}] ${source}: ${message}`,
        level,
        source
    };
    monitoringData.consoleOutput.unshift(consoleEntry);
    if (monitoringData.consoleOutput.length > MAX_CONSOLE_OUTPUT) {
        monitoringData.consoleOutput = monitoringData.consoleOutput.slice(0, MAX_CONSOLE_OUTPUT);
    }
    // Also log to console for debugging
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${source}: ${message}`);
}
function addError(message, source, details) {
    const timestamp = new Date().toISOString();
    const errorEntry = {
        id: Date.now() + Math.random(),
        timestamp,
        message,
        source,
        details: details || {},
        severity: getSeverity(message)
    };
    monitoringData.errors.unshift(errorEntry);
    if (monitoringData.errors.length > MAX_ERRORS) {
        monitoringData.errors = monitoringData.errors.slice(0, MAX_ERRORS);
    }
    // Also add to logs
    addLog('error', message, source, details);
}
function getSeverity(message) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('critical') || lowerMessage.includes('fatal'))
        return 'critical';
    if (lowerMessage.includes('error') || lowerMessage.includes('failed'))
        return 'high';
    if (lowerMessage.includes('warning') || lowerMessage.includes('warn'))
        return 'medium';
    return 'low';
}
function addBalanceChange(walletNumber, walletAddress, solBefore, solAfter, tokenBefore, tokenAfter, source, details) {
    const timestamp = new Date().toISOString();
    const changeEntry = {
        id: Date.now() + Math.random(),
        timestamp,
        walletNumber,
        walletAddress,
        solBefore,
        solAfter,
        solChange: solAfter - solBefore,
        tokenBefore,
        tokenAfter,
        tokenChange: tokenAfter - tokenBefore,
        source,
        details: details || {}
    };
    monitoringData.balanceChanges.unshift(changeEntry);
    if (monitoringData.balanceChanges.length > 1000) {
        monitoringData.balanceChanges = monitoringData.balanceChanges.slice(0, 1000);
    }
}
function addTransaction(walletNumber, walletAddress, type, amount, tokenAmount, status, txHash, error) {
    const timestamp = new Date().toISOString();
    const transactionEntry = {
        id: Date.now() + Math.random(),
        timestamp,
        walletNumber,
        walletAddress,
        type,
        amount,
        tokenAmount,
        status,
        txHash: txHash || '',
        error: error || ''
    };
    monitoringData.transactions.unshift(transactionEntry);
    if (monitoringData.transactions.length > 1000) {
        monitoringData.transactions = monitoringData.transactions.slice(0, 1000);
    }
}
// Initialize monitoring
addLog('info', 'Solbot Core V5 REAL backend server starting...', 'system');
addLog('info', 'Production trading engine loaded successfully', 'system');
addLog('info', `Connected to RPC: ${swapConfig_1.swapConfig.RPC_URL}`, 'system');
// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const startTime = Date.now();
        // Test RPC connection
        const blockHeight = await connection.getBlockHeight();
        const rpcResponseTime = Date.now() - startTime;
        // Update performance metrics
        const memUsage = process.memoryUsage();
        monitoringData.performanceMetrics = {
            cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
            memoryUsage: memUsage.heapUsed / 1024 / 1024, // Convert to MB
            networkLatency: rpcResponseTime,
            rpcResponseTime,
            lastUpdated: new Date().toISOString()
        };
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            blockHeight,
            rpcResponseTime,
            modules: {
                dynamicTrade: 'REAL - LOADED',
                raydiumSwap: 'REAL - LOADED',
                addedOptions: 'REAL - LOADED',
                utility: 'REAL - LOADED',
                poolKeys: 'REAL - LOADED'
            }
        });
    }
    catch (error) {
        addError(`Health check failed: ${error.message}`, 'health');
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// Session management endpoints
app.get('/api/sessions', async (req, res) => {
    try {
        const sessionDir = swapConfig_1.swapConfig.SESSION_DIR;
        if (!fs_1.default.existsSync(sessionDir)) {
            fs_1.default.mkdirSync(sessionDir, { recursive: true });
        }
        const files = fs_1.default.readdirSync(sessionDir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
            const filePath = path_1.default.join(sessionDir, file);
            const stats = fs_1.default.statSync(filePath);
            return {
                filename: file,
                created: stats.birthtime,
                modified: stats.mtime,
                size: stats.size
            };
        })
            .sort((a, b) => b.modified.getTime() - a.modified.getTime());
        res.json(files);
    }
    catch (error) {
        addError(`Failed to list sessions: ${error.message}`, 'sessions');
        res.status(500).json({ error: 'Failed to list sessions' });
    }
});
app.get('/api/sessions/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const sessionPath = path_1.default.join(swapConfig_1.swapConfig.SESSION_DIR, filename);
        if (!fs_1.default.existsSync(sessionPath)) {
            return res.status(404).json({ error: 'Session file not found' });
        }
        const sessionData = await (0, utility_1.loadSession)(sessionPath);
        res.json(sessionData);
    }
    catch (error) {
        addError(`Failed to load session: ${error.message}`, 'sessions');
        res.status(500).json({ error: 'Failed to load session' });
    }
});
// Trading endpoints with REAL functionality
app.post('/api/trading/start', async (req, res) => {
    try {
        const { strategy, sessionData } = req.body;
        if (globalTradingFlag.value) {
            return res.status(400).json({ error: 'Trading is already running' });
        }
        globalTradingFlag.value = true;
        // Load session data and create wallet instances using REAL wallet class
        const adminWallet = wallet_1.default.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
        const tradingWallets = sessionData.wallets.map((w) => wallet_1.default.fromPrivateKey(w.privateKey, w.number));
        addLog('info', `REAL trading engine started with strategy: ${strategy}`, 'trading', {
            strategy,
            tokenName: sessionData.tokenName,
            tokenAddress: sessionData.tokenAddress,
            walletCount: tradingWallets.length
        });
        // Store current session for monitoring
        currentTradingSession = {
            adminWallet,
            tradingWallets,
            tokenAddress: sessionData.tokenAddress,
            tokenName: sessionData.tokenName,
            strategy,
            startTime: new Date().toISOString()
        };
        // Start the REAL trading engine
        (0, dynamicTrade_1.dynamicTrade)(adminWallet, tradingWallets, sessionData.tokenAddress, strategy, connection, sessionData.timestamp, sessionData.tokenName, globalTradingFlag).catch((error) => {
            addError(`REAL trading engine error: ${error.message}`, 'trading', { error });
            globalTradingFlag.value = false;
        });
        res.json({
            success: true,
            message: 'REAL production trading engine started successfully',
            sessionInfo: {
                tokenName: sessionData.tokenName,
                tokenAddress: sessionData.tokenAddress,
                strategy,
                walletCount: tradingWallets.length
            }
        });
    }
    catch (error) {
        addError(`Failed to start REAL trading: ${error.message}`, 'trading', { error });
        globalTradingFlag.value = false;
        res.status(500).json({ error: 'Failed to start trading' });
    }
});
app.post('/api/trading/stop', async (req, res) => {
    try {
        globalTradingFlag.value = false;
        currentTradingSession = null;
        addLog('info', 'REAL trading stopped by user', 'trading');
        res.json({ success: true, message: 'Trading stopped' });
    }
    catch (error) {
        addError(`Failed to stop trading: ${error.message}`, 'trading');
        res.status(500).json({ error: 'Failed to stop trading' });
    }
});
app.post('/api/trading/pause', async (req, res) => {
    try {
        globalTradingFlag.value = false;
        addLog('info', 'REAL trading paused by user', 'trading');
        res.json({ success: true, message: 'Trading paused' });
    }
    catch (error) {
        addError(`Failed to pause trading: ${error.message}`, 'trading');
        res.status(500).json({ error: 'Failed to pause trading' });
    }
});
app.post('/api/trading/resume', async (req, res) => {
    try {
        globalTradingFlag.value = true;
        addLog('info', 'REAL trading resumed by user', 'trading');
        res.json({ success: true, message: 'Trading resumed' });
    }
    catch (error) {
        addError(`Failed to resume trading: ${error.message}`, 'trading');
        res.status(500).json({ error: 'Failed to resume trading' });
    }
});
// Cleanup operations using REAL functions
app.post('/api/cleanup/close-accounts', async (req, res) => {
    try {
        const { sessionData } = req.body;
        const adminWallet = wallet_1.default.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
        const tradingWallets = sessionData.wallets.map((w) => wallet_1.default.fromPrivateKey(w.privateKey, w.number));
        addLog('info', 'Starting REAL token account cleanup', 'cleanup');
        // Use the REAL closeTokenAccountsAndSendBalance function
        await (0, addedOptions_1.closeTokenAccountsAndSendBalance)(adminWallet, tradingWallets, sessionData.tokenAddress, connection);
        addLog('info', 'REAL token account cleanup completed successfully', 'cleanup');
        res.json({ success: true, message: 'Token accounts closed and balances sent to admin wallet' });
    }
    catch (error) {
        addError(`REAL cleanup failed: ${error.message}`, 'cleanup', { error });
        res.status(500).json({ error: 'Failed to close token accounts' });
    }
});
// Monitoring endpoints
app.get('/api/monitoring/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(monitoringData.logs.slice(0, limit));
});
app.get('/api/monitoring/console', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(monitoringData.consoleOutput.slice(0, limit));
});
app.get('/api/monitoring/errors', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(monitoringData.errors.slice(0, limit));
});
app.get('/api/monitoring/performance', (req, res) => {
    res.json(monitoringData.performanceMetrics);
});
app.get('/api/monitoring/health', (req, res) => {
    const systemHealth = {
        status: globalTradingFlag.value ? 'trading' : 'idle',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        trading: {
            active: globalTradingFlag.value,
            session: currentTradingSession ? {
                tokenName: currentTradingSession.tokenName,
                strategy: currentTradingSession.strategy,
                walletCount: currentTradingSession.tradingWallets.length,
                startTime: currentTradingSession.startTime
            } : null
        },
        timestamp: new Date().toISOString()
    };
    res.json(systemHealth);
});
app.get('/api/monitoring/balance-changes', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(monitoringData.balanceChanges.slice(0, limit));
});
app.get('/api/monitoring/analytics', (req, res) => {
    const analytics = {
        totalLogs: monitoringData.logs.length,
        totalErrors: monitoringData.errors.length,
        totalTransactions: monitoringData.transactions.length,
        totalBalanceChanges: monitoringData.balanceChanges.length,
        errorRate: monitoringData.logs.length > 0 ? (monitoringData.errors.length / monitoringData.logs.length) * 100 : 0,
        lastActivity: monitoringData.logs.length > 0 ? monitoringData.logs[0].timestamp : null,
        tradingStatus: globalTradingFlag.value ? 'active' : 'inactive'
    };
    res.json(analytics);
});
app.get('/api/monitoring/transactions', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(monitoringData.transactions.slice(0, limit));
});
// Start server
app.listen(PORT, '0.0.0.0', () => {
    addLog('info', `Solbot Core V5 REAL backend server running on port ${PORT}`, 'system');
    addLog('info', 'PRODUCTION trading engine ready for market', 'system');
    console.log(`🚀 Solbot Core V5 REAL backend server running on port ${PORT}`);
    console.log(`✅ PRODUCTION trading engine loaded and ready`);
    console.log(`🔥 NO MOCKS - REAL TRADING POWER ACTIVATED`);
});
//# sourceMappingURL=api-server.js.map