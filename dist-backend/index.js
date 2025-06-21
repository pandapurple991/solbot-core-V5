"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const web3_js_1 = require("@solana/web3.js");
const chalk_1 = __importDefault(require("chalk"));
const prompt_sync_1 = __importDefault(require("prompt-sync"));
const addedOptions_1 = require("./addedOptions");
const pool_keys_1 = require("./pool-keys");
const swapConfig_1 = require("./swapConfig");
const RaydiumSwap_1 = __importDefault(require("./RaydiumSwap"));
const utility_1 = require("./utility");
const dynamicTrade_1 = require("./dynamicTrade");
const axios_1 = __importDefault(require("axios"));
const startTrading_1 = require("./startTrading");
const wallet_1 = __importDefault(require("./wallet"));
const prompt = (0, prompt_sync_1.default)();
const { SESSION_DIR, RPC_URL } = swapConfig_1.swapConfig;
let connection;
let raydiumSwap;
let adminWallet;
let tradingWallets = [];
let tokenAddress = '';
let tokenName = '';
let tokenSymbol = '';
let poolKeys = null; // Cache for pool keys
let sessionTimestamp;
const log = (message, color = 'white') => console.log(chalk_1.default[color](message));
// Initialize connection
async function getProvider() {
    connection = new web3_js_1.Connection(RPC_URL, 'confirmed');
    log(`Connected to provider: ${RPC_URL}`);
    return connection;
}
// Get Dexscreener data
async function getDexscreenerData(tokenAddress) {
    try {
        const response = await axios_1.default.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        return response.data;
    }
    catch (error) {
        log(`Failed to fetch token data from Dexscreener: ${error.message}`, 'red');
        return null;
    }
}
async function main() {
    try {
        log('Initializing provider...', 'cyanBright');
        connection = await getProvider();
        log('Provider initialized.', 'cyanBright');
        await fs.promises.mkdir(SESSION_DIR, { recursive: true });
        console.log(chalk_1.default.blueBright('Choose option:\n' +
            chalk_1.default.white('[1] Start a new session\n') +
            chalk_1.default.white('[2] Restart session from a specific point')));
        let sessionOpt = parseInt(prompt('Choose Number: '), 10);
        let currentSessionFileName;
        if (sessionOpt === 1) {
            console.log(chalk_1.default.blueBright('Enter token address:'));
            tokenAddress = prompt('Token address: ');
            // Fetch token data
            const tokenData = await getDexscreenerData(tokenAddress);
            if (tokenData && tokenData.pairs && tokenData.pairs.length > 0) {
                const pair = tokenData.pairs[0];
                tokenName = pair.baseToken.name;
                tokenSymbol = pair.baseToken.symbol;
                log(`Token Confirmed: ${tokenName} (${tokenSymbol})`, 'green');
                const now = new Date();
                sessionTimestamp = now.toISOString();
                // Fetch market ID and pool keys
                try {
                    const marketId = await (0, pool_keys_1.getMarketIdForTokenAddress)(connection, tokenAddress);
                    if (!marketId) {
                        log('Market ID not found.', 'red');
                        return;
                    }
                    log('Fetching pool keys...', 'yellow');
                    poolKeys = await (0, pool_keys_1.getPoolKeysForTokenAddress)(connection, tokenAddress);
                    if (poolKeys) {
                        log('Pool keys confirmed', 'green');
                    }
                    else {
                        log('Pool keys not found', 'red');
                    }
                }
                catch (error) {
                    log(`Error fetching pool keys: ${error.message}`, 'red');
                    return;
                }
                // Save session immediately after token discovery with placeholder values
                currentSessionFileName = `${tokenName}_${(0, utility_1.formatTimestampToEST)(new Date(sessionTimestamp))}_session.json`;
                log(`Saving session to file: ${currentSessionFileName}`, 'cyanBright');
                const initialSessionData = {
                    admin: {
                        number: 'to be created',
                        privateKey: 'to be created'
                    },
                    wallets: [],
                    tokenAddress,
                    poolKeys,
                    tokenName,
                    timestamp: (0, utility_1.formatTimestampToEST)(new Date(sessionTimestamp))
                };
                try {
                    fs.writeFileSync(path.join(SESSION_DIR, currentSessionFileName), JSON.stringify(initialSessionData, null, 2));
                    log('Session saved successfully', 'green');
                }
                catch (error) {
                    log('Failed to save initial session', 'red');
                    return;
                }
                console.log(chalk_1.default.blueBright('Would you like to view additional token information?'));
                console.log(chalk_1.default.green('[1] Yes'));
                console.log(chalk_1.default.red('[2] No'));
                const viewInfo = prompt('').toLowerCase();
                if (viewInfo === '1') {
                    console.log(chalk_1.default.cyanBright(`Price: ${pair.priceUsd} USD`));
                    console.log(chalk_1.default.cyanBright(`24h Volume: ${pair.volume.h24}`));
                    console.log(chalk_1.default.cyanBright(`24h Price Change: ${pair.priceChange.h24}%`));
                    console.log(chalk_1.default.cyanBright(`24h Buys: ${pair.txns.h24.buys}`));
                    console.log(chalk_1.default.cyanBright(`24h Sells: ${pair.txns.h24.sells}`));
                }
                console.log(chalk_1.default.blueBright('Would you like to import an admin wallet?'));
                console.log(chalk_1.default.green('[1] Yes'));
                console.log(chalk_1.default.red('[2] No'));
                const importAdmin = prompt('').toLowerCase();
                if (importAdmin === '1') {
                    const adminPrivateKey = prompt('Enter admin wallet private key: ');
                    adminWallet = (0, utility_1.createWalletWithNumber)(adminPrivateKey, 0);
                    log(`Admin wallet imported\nPublic Key: ${adminWallet.publicKey}\nPrivate Key: ${adminWallet.privateKey}`, 'white');
                    log(`Updating session file with admin wallet details: ${currentSessionFileName}`, 'cyanBright');
                    if (!await (0, utility_1.saveSession)(adminWallet, [], SESSION_DIR, tokenName, sessionTimestamp, tokenAddress, poolKeys, currentSessionFileName)) {
                        log('Error updating session with admin wallet. Exiting...', 'red');
                        return;
                    }
                    log('Session updated successfully', 'green');
                    log('Deposit funds to the admin wallet and press enter...', 'blueBright');
                    prompt('');
                    const solBalance = await (0, utility_1.getSolBalance)(adminWallet, connection);
                    log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');
                }
                else {
                    log('Creating admin wallet...', 'cyanBright');
                    adminWallet = new wallet_1.default();
                    log(`Admin wallet generated\nPublic Key: ${adminWallet.publicKey}\nPrivate Key: ${adminWallet.privateKey}`, 'white');
                    log(`Updating session file with admin wallet details: ${currentSessionFileName}`, 'cyanBright');
                    if (!await (0, utility_1.saveSession)(adminWallet, [], SESSION_DIR, tokenName, sessionTimestamp, tokenAddress, poolKeys, currentSessionFileName)) {
                        log('Error updating session with admin wallet. Exiting...', 'red');
                        return;
                    }
                    log('Session updated successfully', 'green');
                    log('Deposit funds to the admin wallet and press enter...', 'blueBright');
                    prompt('');
                    const solBalance = await (0, utility_1.getSolBalance)(adminWallet, connection);
                    log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');
                }
                console.log(chalk_1.default.blueBright('How many wallets do you want to create?'));
                const numWallets = parseInt(prompt('Number of wallets: '), 10);
                const solToSend = parseFloat(prompt('Enter amount in SOL: '));
                // Ensure solToSend is correctly dispersed
                const newWallets = Array.from({ length: numWallets }, () => new wallet_1.default());
                tradingWallets = newWallets;
                log(`Generated ${numWallets} wallets.`, 'magentaBright');
                log(`Saving session after wallet generation to file: ${currentSessionFileName}`, 'blueBright');
                if (!await (0, utility_1.appendWalletsToSession)(tradingWallets, path.join(SESSION_DIR, currentSessionFileName))) {
                    log('Error saving session after wallet generation. Exiting...', 'red');
                    return;
                }
                const amountToDisperse = solToSend; // Correctly assign total amount to disperse
                log(`Dispersing ${amountToDisperse.toFixed(6)} SOL to ${numWallets} wallets...`, 'yellow');
                const { successWallets } = await (0, utility_1.distributeSol)(adminWallet, tradingWallets, amountToDisperse, connection);
                tradingWallets = successWallets;
                log(`Successfully loaded ${successWallets.length} wallets.`, 'green');
                const adminWalletKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
                const adminTokenBalance = await (0, startTrading_1.getTokenBalance)(new RaydiumSwap_1.default(process.env.RPC_URL, adminWallet.privateKey), tokenAddress);
                if (adminTokenBalance > 0) {
                    console.log(chalk_1.default.blueBright(`Do you want to transfer ${tokenSymbol} to the wallets?`));
                    console.log(chalk_1.default.white('[1] Yes\n[2] No'));
                    const transferTokensOpt = parseInt(prompt('Choose Number: '), 10);
                    if (transferTokensOpt === 1) {
                        const amountPerWallet = adminTokenBalance / tradingWallets.length;
                        for (const wallet of tradingWallets) {
                            await (0, utility_1.distributeTokens)(adminWallet, new web3_js_1.PublicKey(adminWallet.publicKey), [wallet], new web3_js_1.PublicKey(tokenAddress), amountPerWallet, 9, connection);
                        }
                        log('Tokens transferred to wallets', 'green');
                    }
                }
                else {
                    log('Admin wallet has 0 tokens', 'yellow');
                }
                console.log(chalk_1.default.blueBright('Choose trading strategy:\n' +
                    chalk_1.default.white('[1] Increase Makers + Volume\n') +
                    chalk_1.default.white('[2] Increase Volume Only')));
                const tradeStrategyOpt = parseInt(prompt('Choose Number: '), 10);
                const tradeStrategy = tradeStrategyOpt === 1 ? 'INCREASE_MAKERS_VOLUME' : 'INCREASE_VOLUME_ONLY';
                log('Trading initiated .....', 'cyanBright');
                const globalTradingFlag = { value: true }; // Define global trading flag here
                await (0, dynamicTrade_1.dynamicTrade)(adminWallet, tradingWallets, tokenAddress, tradeStrategy, connection, sessionTimestamp, tokenName, globalTradingFlag);
            }
            else {
                log('Token not found or invalid response from Dexscreener. Please check the address and try again.', 'red');
                return;
            }
        }
        else if (sessionOpt === 2) {
            const sessionFiles = fs.readdirSync(SESSION_DIR).filter(file => file.endsWith('_session.json'));
            if (sessionFiles.length === 0) {
                log('No session files found.', 'red');
                return;
            }
            console.log(chalk_1.default.blueBright('Select a session file to restart:'));
            sessionFiles.forEach((file, index) => {
                console.log(chalk_1.default.white(`[${index + 1}] ${file}`));
            });
            const fileOpt = parseInt(prompt('Choose Number: '), 10);
            const selectedFile = sessionFiles[fileOpt - 1];
            // Load session data
            const sessionData = await (0, utility_1.loadSession)(selectedFile);
            // Initialize admin wallet
            adminWallet = (0, utility_1.createWalletWithNumber)(sessionData.admin.privateKey, sessionData.admin.number);
            // Initialize trading wallets
            tradingWallets = sessionData.wallets.map(wallet => (0, utility_1.createWalletWithNumber)(wallet.privateKey, wallet.number));
            tokenAddress = sessionData.tokenAddress;
            tokenName = sessionData.tokenName;
            poolKeys = sessionData.poolKeys;
            sessionTimestamp = sessionData.timestamp;
            currentSessionFileName = selectedFile;
            console.log(chalk_1.default.blueBright('Select a point to restart:'));
            console.log(chalk_1.default.white('[1] After token discovery\n[2] After admin wallet creation\n[3] After wallet generation\n[4] After wallet funding\n[5] Token transfer to wallets\n[6] Close Token Account & Send Balance to Admin'));
            const restartOpt = parseInt(prompt('Choose Number: '), 10);
            if (restartOpt === 1) {
                log('Creating admin wallet...', 'cyanBright');
                adminWallet = new wallet_1.default();
                log(`Admin wallet generated\nPublic Key: ${adminWallet.publicKey}\nPrivate Key: ${adminWallet.privateKey}`, 'white');
                log(`Updating session file with admin wallet details: ${currentSessionFileName}`, 'cyanBright');
                if (!await (0, utility_1.saveSession)(adminWallet, [], SESSION_DIR, tokenName, sessionTimestamp, tokenAddress, poolKeys, currentSessionFileName)) {
                    log('Error updating session with admin wallet. Exiting...', 'red');
                    return;
                }
                log('Session updated successfully', 'green');
                log('Deposit funds to the admin wallet and press enter...', 'blueBright');
                prompt('');
                const solBalance = await (0, utility_1.getSolBalance)(adminWallet, connection);
                log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');
            }
            if (restartOpt === 2) {
                log('Deposit funds to the admin wallet and press enter...', 'blueBright');
                prompt('');
                const solBalance = await (0, utility_1.getSolBalance)(adminWallet, connection);
                log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');
                console.log(chalk_1.default.blueBright('How many wallets do you want to create?'));
                const numWallets = parseInt(prompt('Number of wallets: '), 10);
                const solToSend = parseFloat(prompt('Enter amount in SOL: '));
                const newWallets = Array.from({ length: numWallets }, () => new wallet_1.default());
                tradingWallets = newWallets;
                log(`Generated ${numWallets} wallets.`, 'yellow');
                log(`Saving session after wallet generation to file: ${currentSessionFileName}`, 'magenta');
                if (!await (0, utility_1.appendWalletsToSession)(tradingWallets, path.join(SESSION_DIR, currentSessionFileName))) {
                    log('Error saving session after wallet generation. Exiting...', 'red');
                    return;
                }
                const amountToDisperse = solToSend / numWallets;
                log(`Dispersing ${amountToDisperse.toFixed(6)} SOL to ${numWallets} wallets...`, 'cyanBright');
                const { successWallets } = await (0, utility_1.distributeSol)(adminWallet, tradingWallets, amountToDisperse, connection);
                tradingWallets = successWallets;
                log(`Successfully loaded ${successWallets.length} wallets.`, 'green');
            }
            if (restartOpt === 3) {
                console.log(chalk_1.default.blueBright('How much SOL do you want to send?'));
                const solToSend = parseFloat(prompt('Enter amount in SOL: '));
                const amountToDisperse = solToSend / tradingWallets.length;
                log(`Dispersing ${amountToDisperse.toFixed(6)} SOL to ${tradingWallets.length} wallets...`, 'cyanBright');
                const { successWallets } = await (0, utility_1.distributeSol)(adminWallet, tradingWallets, solToSend, connection);
                tradingWallets = successWallets;
                log(`Successfully loaded ${successWallets.length} wallets.`, 'green');
            }
            if (restartOpt === 4) {
                try {
                    const adminWalletKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
                    const adminTokenBalance = await (0, startTrading_1.getTokenBalance)(new RaydiumSwap_1.default(process.env.RPC_URL, adminWalletKey), tokenAddress);
                    const adminSolBalance = await (0, utility_1.getSolBalance)(adminWallet, connection);
                    console.log(chalk_1.default.greenBright(`Admin Wallet SOL: ${chalk_1.default.white(adminSolBalance.toFixed(6))}, ${tokenName}: ${chalk_1.default.white(adminTokenBalance)}`));
                    for (const wallet of tradingWallets) {
                        const walletRaydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, wallet.privateKey);
                        const walletSolBalance = await (0, utility_1.getSolBalance)(wallet, connection);
                        const walletTokenBalance = await (0, startTrading_1.getTokenBalance)(walletRaydiumSwap, tokenAddress);
                        console.log(chalk_1.default.greenBright(`Trading Wallet (${chalk_1.default.cyan(wallet.number)}) SOL: ${chalk_1.default.white(walletSolBalance.toFixed(6))}, ${tokenName}: ${chalk_1.default.white(walletTokenBalance)}`));
                    }
                    console.log(chalk_1.default.blueBright('Choose trading strategy:\n' +
                        chalk_1.default.white('[1] Increase Makers + Volume\n') +
                        chalk_1.default.white('[2] Increase Volume Only')));
                    const tradeStrategyOpt = parseInt(prompt('Choose Number: '), 10);
                    const tradeStrategy = tradeStrategyOpt === 1 ? 'INCREASE_MAKERS_VOLUME' : 'INCREASE_VOLUME_ONLY';
                    const globalTradingFlag = { value: true }; // Define global trading flag here
                    await (0, dynamicTrade_1.dynamicTrade)(adminWallet, tradingWallets, tokenAddress, tradeStrategy, connection, sessionTimestamp, tokenName, globalTradingFlag);
                }
                catch (error) {
                    log(`Error in restart point 4: ${error.message}`, 'red');
                    return;
                }
            }
            if (restartOpt === 5) {
                try {
                    const adminWalletKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
                    const adminTokenBalance = await (0, startTrading_1.getTokenBalance)(new RaydiumSwap_1.default(process.env.RPC_URL, adminWalletKey), tokenAddress);
                    if (adminTokenBalance > 0) {
                        const amountPerWallet = adminTokenBalance / tradingWallets.length;
                        for (const wallet of tradingWallets) {
                            await (0, utility_1.distributeTokens)(adminWallet, new web3_js_1.PublicKey(adminWallet.publicKey), [wallet], new web3_js_1.PublicKey(tokenAddress), amountPerWallet, 9, connection);
                        }
                        log('Tokens transferred to wallets', 'green');
                    }
                    else {
                        log('Admin wallet has 0 tokens', 'yellow');
                    }
                    console.log(chalk_1.default.blueBright('Choose trading strategy:\n[1] Increase Makers + Volume\n[2] Increase Volume Only'));
                    const tradeStrategyOpt = parseInt(prompt('Choose Number: '), 10);
                    const tradeStrategy = tradeStrategyOpt === 1 ? 'INCREASE_MAKERS_VOLUME' : 'INCREASE_VOLUME_ONLY';
                    const globalTradingFlag = { value: true }; // Define global trading flag here
                    await (0, dynamicTrade_1.dynamicTrade)(adminWallet, tradingWallets, tokenAddress, tradeStrategy, connection, sessionTimestamp, tokenName, globalTradingFlag);
                }
                catch (error) {
                    log(`Error in restart point 5: ${error.message}`, 'red');
                    return;
                }
            }
            if (restartOpt === 6) {
                try {
                    await (0, addedOptions_1.closeTokenAccountsAndSendBalance)(adminWallet, tradingWallets, tokenAddress, connection);
                    console.log(chalk_1.default.green('All token accounts closed and balances sent to admin wallet.'));
                }
                catch (error) {
                    console.log(chalk_1.default.red(`Error in closing token accounts and sending balances: ${error.message}`));
                }
            }
        }
        else {
            log('Failed to load session. Exiting...', 'red');
            return;
        }
    }
    catch (error) {
        log('Unhandled error in main function', 'redBright');
        log(error, 'redBright');
    }
}
main().catch(error => {
    log('Unhandled error in main function', 'redBright');
    log(error, 'redBright');
});
//# sourceMappingURL=index.js.map