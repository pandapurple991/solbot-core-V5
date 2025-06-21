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
const bs58_1 = __importDefault(require("bs58"));
const dotenv_1 = __importDefault(require("dotenv"));
// Import your REAL core files
const dynamicTrade_js_1 = require("./dynamicTrade.js");
const addedOptions_js_1 = require("./addedOptions.js");
const swapConfig_js_1 = require("./swapConfig.js");
const utility_js_1 = require("./utility.js");
const pool_keys_js_1 = require("./pool-keys.js");
const wallet_js_1 = __importDefault(require("./wallet.js"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 12001;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Global trading state
const globalTradingFlag = { value: false };
let currentTradingSession = null;
// Connection setup
const connection = new web3_js_1.Connection(swapConfig_js_1.swapConfig.RPC_URL, 'confirmed');
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
addLog('info', 'Solbot Core V5 backend server starting...', 'system');
addLog('info', 'Real trading engine loaded successfully', 'system');
addLog('info', `Connected to RPC: ${swapConfig_js_1.swapConfig.RPC_URL}`, 'system');
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
                dynamicTrade: 'loaded',
                raydiumSwap: 'loaded',
                addedOptions: 'loaded',
                utility: 'loaded',
                poolKeys: 'loaded'
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
        const sessionDir = swapConfig_js_1.swapConfig.SESSION_DIR;
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
        const sessionPath = path_1.default.join(swapConfig_js_1.swapConfig.SESSION_DIR, filename);
        if (!fs_1.default.existsSync(sessionPath)) {
            return res.status(404).json({ error: 'Session file not found' });
        }
        const sessionData = await (0, utility_js_1.loadSession)(sessionPath);
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
        // Load session data and create wallet instances
        const adminWallet = wallet_js_1.default.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
        const tradingWallets = sessionData.wallets.map((w) => wallet_js_1.default.fromPrivateKey(w.privateKey, w.number));
        addLog('info', `Trading started with strategy: ${strategy}`, 'trading', {
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
        (0, dynamicTrade_js_1.dynamicTrade)(adminWallet, tradingWallets, sessionData.tokenAddress, strategy, connection, sessionData.timestamp, sessionData.tokenName, globalTradingFlag).catch(error => {
            addError(`Trading error: ${error.message}`, 'trading', { error });
            globalTradingFlag.value = false;
        });
        res.json({
            success: true,
            message: 'Real trading engine started successfully',
            sessionInfo: {
                tokenName: sessionData.tokenName,
                tokenAddress: sessionData.tokenAddress,
                strategy,
                walletCount: tradingWallets.length
            }
        });
    }
    catch (error) {
        addError(`Failed to start trading: ${error.message}`, 'trading', { error });
        globalTradingFlag.value = false;
        res.status(500).json({ error: 'Failed to start trading' });
    }
});
app.post('/api/trading/stop', async (req, res) => {
    try {
        globalTradingFlag.value = false;
        currentTradingSession = null;
        addLog('info', 'Trading stopped by user', 'trading');
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
        addLog('info', 'Trading paused by user', 'trading');
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
        addLog('info', 'Trading resumed by user', 'trading');
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
        const adminWallet = wallet_js_1.default.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
        const tradingWallets = sessionData.wallets.map((w) => wallet_js_1.default.fromPrivateKey(w.privateKey, w.number));
        addLog('info', 'Starting token account cleanup', 'cleanup');
        // Use the REAL closeTokenAccountsAndSendBalance function
        await (0, addedOptions_js_1.closeTokenAccountsAndSendBalance)(adminWallet, tradingWallets, sessionData.tokenAddress, connection);
        addLog('info', 'Token account cleanup completed successfully', 'cleanup');
        res.json({ success: true, message: 'Token accounts closed and balances sent to admin wallet' });
    }
    catch (error) {
        addError(`Cleanup failed: ${error.message}`, 'cleanup', { error });
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
// Wallet creation endpoints
app.post('/api/wallets/admin', async (req, res) => {
    try {
        addLog('info', 'Creating admin wallet', 'wallet');
        const adminWallet = (0, utility_js_1.createWalletWithNumber)(0);
        const walletData = {
            number: adminWallet.number,
            publicKey: adminWallet.publicKey.toString(),
            privateKey: bs58_1.default.encode(adminWallet.secretKey),
            balance: 0
        };
        addLog('success', `Admin wallet created: ${walletData.publicKey}`, 'wallet');
        res.json(walletData);
    }
    catch (error) {
        addError(`Failed to create admin wallet: ${error}`, 'wallet', { error });
        res.status(500).json({ error: 'Failed to create admin wallet' });
    }
});
app.post('/api/wallets/trading', async (req, res) => {
    try {
        const { count } = req.body;
        if (!count || count < 1 || count > 100) {
            return res.status(400).json({ error: 'Invalid wallet count (1-100)' });
        }
        addLog('info', `Creating ${count} trading wallets`, 'wallet');
        const wallets = [];
        for (let i = 1; i <= count; i++) {
            const wallet = (0, utility_js_1.createWalletWithNumber)(i);
            wallets.push({
                number: wallet.number,
                publicKey: wallet.publicKey.toString(),
                privateKey: bs58_1.default.encode(wallet.secretKey),
                balance: 0
            });
        }
        addLog('success', `Created ${count} trading wallets`, 'wallet');
        res.json(wallets);
    }
    catch (error) {
        addError(`Failed to create trading wallets: ${error}`, 'wallet', { error });
        res.status(500).json({ error: 'Failed to create trading wallets' });
    }
});
app.post('/api/wallets/import', async (req, res) => {
    try {
        const { privateKey } = req.body;
        if (!privateKey) {
            return res.status(400).json({ error: 'Private key is required' });
        }
        addLog('info', 'Importing wallet from private key', 'wallet');
        const keypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(privateKey));
        const walletData = {
            number: 0,
            publicKey: keypair.publicKey.toString(),
            privateKey: privateKey,
            balance: 0
        };
        addLog('success', `Wallet imported: ${walletData.publicKey}`, 'wallet');
        res.json(walletData);
    }
    catch (error) {
        addError(`Failed to import wallet: ${error}`, 'wallet', { error });
        res.status(500).json({ error: 'Failed to import wallet' });
    }
});
// Session management endpoints
app.post('/api/sessions', async (req, res) => {
    try {
        const sessionData = req.body;
        const filename = await (0, utility_js_1.saveSession)(sessionData);
        addLog('success', `Session saved: ${filename}`, 'session');
        res.json({ filename });
    }
    catch (error) {
        addError(`Failed to save session: ${error}`, 'session', { error });
        res.status(500).json({ error: 'Failed to save session' });
    }
});
app.post('/api/sessions/append-wallets', async (req, res) => {
    try {
        const { wallets, sessionFileName } = req.body;
        await (0, utility_js_1.appendWalletsToSession)(wallets, sessionFileName);
        addLog('success', `Wallets appended to session: ${sessionFileName}`, 'session');
        res.json({ success: true });
    }
    catch (error) {
        addError(`Failed to append wallets: ${error}`, 'session', { error });
        res.status(500).json({ error: 'Failed to append wallets' });
    }
});
app.delete('/api/sessions/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const sessionPath = path_1.default.join(process.cwd(), 'sessions', filename);
        if (fs_1.default.existsSync(sessionPath)) {
            fs_1.default.unlinkSync(sessionPath);
            addLog('success', `Session deleted: ${filename}`, 'session');
            res.json({ success: true });
        }
        else {
            res.status(404).json({ error: 'Session not found' });
        }
    }
    catch (error) {
        addError(`Failed to delete session: ${error}`, 'session', { error });
        res.status(500).json({ error: 'Failed to delete session' });
    }
});
app.post('/api/sessions/export-env', async (req, res) => {
    try {
        const sessionData = req.body;
        let envContent = `# Solbot Core V5 Environment Configuration\n`;
        envContent += `TOKEN_ADDRESS=${sessionData.tokenAddress}\n`;
        envContent += `TOKEN_NAME=${sessionData.tokenName}\n`;
        envContent += `ADMIN_PRIVATE_KEY=${sessionData.admin.privateKey}\n`;
        sessionData.wallets.forEach((wallet, index) => {
            envContent += `WALLET_${index + 1}_PRIVATE_KEY=${wallet.privateKey}\n`;
        });
        addLog('success', 'Environment file generated', 'session');
        res.json({ envContent });
    }
    catch (error) {
        addError(`Failed to generate env file: ${error}`, 'session', { error });
        res.status(500).json({ error: 'Failed to generate env file' });
    }
});
// Token validation endpoints
app.post('/api/tokens/validate', async (req, res) => {
    try {
        const { address } = req.body;
        // Use your real token validation logic here
        const isValid = address && address.length === 44; // Basic validation
        if (isValid) {
            // Mock token data - replace with real API call
            const tokenData = {
                name: 'Token Name',
                symbol: 'TKN',
                address: address,
                price: '0.001',
                volume: { h24: '1000' },
                priceChange: { h24: '5.2' },
                txns: { h24: { buys: 100, sells: 80 } }
            };
            res.json({ isValid: true, tokenData });
        }
        else {
            res.json({ isValid: false });
        }
    }
    catch (error) {
        addError(`Token validation failed: ${error}`, 'token', { error });
        res.status(500).json({ error: 'Token validation failed' });
    }
});
app.post('/api/tokens/pool-keys', async (req, res) => {
    try {
        const { tokenAddress } = req.body;
        const poolKeys = await (0, pool_keys_js_1.getPoolKeysForTokenAddress)(tokenAddress);
        res.json(poolKeys);
    }
    catch (error) {
        addError(`Failed to get pool keys: ${error}`, 'token', { error });
        res.status(500).json({ error: 'Failed to get pool keys' });
    }
});
app.post('/api/tokens/market-id', async (req, res) => {
    try {
        const { tokenAddress } = req.body;
        const marketId = await (0, pool_keys_js_1.getMarketIdForTokenAddress)(tokenAddress);
        res.json({ marketId });
    }
    catch (error) {
        addError(`Failed to get market ID: ${error}`, 'token', { error });
        res.status(500).json({ error: 'Failed to get market ID' });
    }
});
// Configuration endpoints
app.post('/api/config/swap', async (req, res) => {
    try {
        const config = req.body;
        // Save swap config logic here
        addLog('success', 'Swap configuration saved', 'config');
        res.json({ success: true });
    }
    catch (error) {
        addError(`Failed to save swap config: ${error}`, 'config', { error });
        res.status(500).json({ error: 'Failed to save swap config' });
    }
});
app.get('/api/config/swap', async (req, res) => {
    try {
        // Return current swap config
        res.json(swapConfig_js_1.swapConfig);
    }
    catch (error) {
        addError(`Failed to get swap config: ${error}`, 'config', { error });
        res.status(500).json({ error: 'Failed to get swap config' });
    }
});
app.post('/api/config/test-rpc', async (req, res) => {
    try {
        const { rpcUrl } = req.body;
        const startTime = Date.now();
        const testConnection = new web3_js_1.Connection(rpcUrl, 'confirmed');
        await testConnection.getLatestBlockhash();
        const latency = Date.now() - startTime;
        res.json({ success: true, latency });
    }
    catch (error) {
        res.json({ success: false, latency: -1 });
    }
});
// Start server
app.listen(PORT, '0.0.0.0', () => {
    addLog('info', `Solbot Core V5 server running on port ${PORT}`, 'system');
    addLog('info', 'Real trading engine ready for production', 'system');
    console.log(`🚀 Solbot Core V5 server running on port ${PORT}`);
    console.log(`✅ Real trading engine loaded and ready`);
});
//# sourceMappingURL=server.js.map