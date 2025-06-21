"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrading = exports.swapLoop = exports.getTokenBalance = void 0;
const RaydiumSwap_1 = __importDefault(require("./RaydiumSwap"));
require("dotenv/config");
const swapConfig_1 = require("./swapConfig");
const chalk_1 = __importDefault(require("chalk"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const readline_1 = __importDefault(require("readline"));
const keypress_1 = __importDefault(require("keypress"));
const pool_keys_1 = require("./pool-keys");
// Function to get all wallet keys from the .env file
const getAllWalletKeys = () => {
    const walletKeys = [];
    let walletKeyIndex = 1;
    let walletKey = process.env[`WALLET_PRIVATE_KEY_${walletKeyIndex}`];
    while (walletKey) {
        walletKeys.push(walletKey);
        walletKeyIndex++;
        walletKey = process.env[`WALLET_PRIVATE_KEY_${walletKeyIndex}`];
    }
    return walletKeys;
};
const walletKeys = getAllWalletKeys();
const adminWalletKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
const tokenAddress = process.env.TOKEN_ADDRESS;
if (!adminWalletKey) {
    throw new Error('ADMIN_WALLET_PRIVATE_KEY is not defined in the environment variables.');
}
walletKeys.forEach((key, index) => {
    if (!key) {
        throw new Error(`WALLET_PRIVATE_KEY_${index + 1} is not defined in the environment variables.`);
    }
});
let poolInfoCache = null;
let poolInfoReady = false;
let tokenName = '';
let tokenSymbol = '';
let tradingPaused = false;
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
const prompt = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
};
const validateTokenAddress = async (tokenAddress) => {
    const response = await (0, node_fetch_1.default)(`https://api.dexscreener.io/latest/dex/tokens/${tokenAddress}`);
    const data = await response.json();
    if (data.pairs && data.pairs.length > 0) {
        const { baseToken } = data.pairs[0];
        tokenName = baseToken.name;
        tokenSymbol = baseToken.symbol;
        return true;
    }
    return false;
};
const performSwap = async (raydiumSwap, direction, amount, walletNumber) => {
    try {
        if (!poolInfoReady) {
            if (!poolInfoCache) {
                console.log(chalk_1.default.yellow(`Admin Is Initializing Swapping...`));
                console.log(chalk_1.default.magentaBright(`Admin Searching for Pool...`));
                let retries = 0;
                while (retries < swapConfig_1.swapConfig.poolSearchMaxRetries) {
                    poolInfoCache = await (0, pool_keys_1.getPoolKeysForTokenAddress)(raydiumSwap.connection, tokenAddress);
                    if (poolInfoCache) {
                        console.log(chalk_1.default.green(`Admin Has Found Pool`));
                        poolInfoReady = true;
                        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds before starting trading
                        break;
                    }
                    retries++;
                    console.log(chalk_1.default.yellow(`Pool not found, retrying... (${retries}/${swapConfig_1.swapConfig.poolSearchMaxRetries})`));
                    await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.poolSearchRetryInterval));
                }
                if (!poolInfoCache) {
                    throw new Error('Pool info not found after maximum retries');
                }
            }
            else {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for pool info to be ready
            }
        }
        const tx = await raydiumSwap.getSwapTransaction(direction === 'buy' ? tokenAddress : swapConfig_1.swapConfig.WSOL_ADDRESS, amount, poolInfoCache, swapConfig_1.swapConfig.maxLamports, direction === 'buy' ? 'in' : 'out');
        const txid = await raydiumSwap.sendVersionedTransaction(tx, swapConfig_1.swapConfig.maxRetries);
        return txid;
    }
    catch (error) {
        console.error(chalk_1.default.cyan(`Error performing swap for wallet ${walletNumber}: ${error.message}`));
        return null;
    }
};
const getTokenBalance = async (raydiumSwap, mintAddress) => {
    try {
        const tokenAccounts = await raydiumSwap.getOwnerTokenAccounts();
        const tokenAccount = tokenAccounts.find(acc => acc.accountInfo.mint.toString() === mintAddress);
        if (!tokenAccount)
            return 0;
        const decimals = await raydiumSwap.getTokenDecimals(mintAddress);
        return Number(tokenAccount.accountInfo.amount) / Math.pow(10, decimals);
    }
    catch (error) {
        return 0;
    }
};
exports.getTokenBalance = getTokenBalance;
const getRandomAmount = (minPercentage, maxPercentage, baseAmount) => {
    const minAmount = baseAmount * (minPercentage / 100);
    const maxAmount = baseAmount * (maxPercentage / 100);
    return minAmount + Math.random() * (maxAmount - minAmount);
};
const swapLoop = async (walletNumber, globalTradingFlag) => {
    try {
        const raydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, walletKeys[walletNumber - 1]);
        console.log(chalk_1.default.cyan(`Wallet ${walletNumber} - Trading is about to begin...`));
        while (globalTradingFlag.value) {
            if (tradingPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            const solBalance = await raydiumSwap.getBalance();
            const buyAmount = getRandomAmount(swapConfig_1.swapConfig.minPercentage, swapConfig_1.swapConfig.maxPercentage, solBalance);
            const buyTxHash = await performSwap(raydiumSwap, 'buy', buyAmount, walletNumber);
            if (buyTxHash) {
                const tokenBalance = await (0, exports.getTokenBalance)(raydiumSwap, tokenAddress);
                console.log(chalk_1.default.green(`Wallet ${chalk_1.default.cyan(walletNumber)} Buy ${chalk_1.default.yellow(buyAmount.toFixed(6))} SOL - Balance ${chalk_1.default.yellow(tokenBalance.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)}`));
                console.log(chalk_1.default.green(`Successful Buy https://solscan.io/tx/${buyTxHash}`));
                await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.loopInterval / 2));
                if (tokenBalance > 0) {
                    const sellAmount = getRandomAmount(swapConfig_1.swapConfig.minSellPercentage, swapConfig_1.swapConfig.maxSellPercentage, tokenBalance);
                    const sellTxHash = await performSwap(raydiumSwap, 'sell', sellAmount, walletNumber);
                    if (sellTxHash) {
                        const solBalance = await raydiumSwap.getBalance();
                        console.log(chalk_1.default.red(`Wallet ${chalk_1.default.cyan(walletNumber)} Sell ${chalk_1.default.yellow(sellAmount.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)} - Balance ${chalk_1.default.yellow(solBalance.toFixed(6))} SOL`));
                        console.log(chalk_1.default.red(`Successful Sell https://solscan.io/tx/${sellTxHash}`));
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.loopInterval / 2));
        }
    }
    catch (error) {
        console.error(chalk_1.default.redBright(`Error in swap loop for wallet ${walletNumber}: ${error.message}`));
    }
};
exports.swapLoop = swapLoop;
const sellAllTokens = async () => {
    console.log('Selling all tokens...');
    for (let index = 0; index < walletKeys.length; index++) {
        const key = walletKeys[index];
        const walletNumber = index + 1;
        const raydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, key);
        console.log(`Wallet ${walletNumber} - Checking token balance...`);
        let tokenBalance = await (0, exports.getTokenBalance)(raydiumSwap, tokenAddress);
        while (tokenBalance >= 5) {
            console.log(chalk_1.default.yellow(`Wallet ${walletNumber} - Found token balance: ${tokenBalance.toFixed(2)} ${tokenSymbol}`));
            console.log(`Wallet ${walletNumber} - Selling ${tokenBalance.toFixed(2)} ${tokenSymbol}...`);
            let sellTxHash;
            for (let attempt = 1; attempt <= swapConfig_1.swapConfig.maxRetries; attempt++) {
                try {
                    sellTxHash = await performSwap(raydiumSwap, 'sell', tokenBalance, walletNumber);
                    if (sellTxHash) {
                        break;
                    }
                }
                catch (error) {
                    if (error.response?.status === 429) {
                        console.error(`Wallet ${walletNumber} - Server responded with 429 Too Many Requests. Retrying after ${swapConfig_1.swapConfig.retryInterval / 1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.retryInterval));
                    }
                    else {
                        console.error(`Wallet ${walletNumber} - Sell attempt ${attempt} failed: ${error.message}.`);
                        if (attempt < swapConfig_1.swapConfig.maxRetries) {
                            console.error(`Retrying in ${swapConfig_1.swapConfig.retryInterval / 1000} seconds...`);
                            await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.retryInterval));
                        }
                        else {
                            console.error(`Wallet ${walletNumber} - Max retries reached.`);
                        }
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000)); // 2-3 second delay
            // Check balance after the sell
            tokenBalance = await (0, exports.getTokenBalance)(raydiumSwap, tokenAddress);
        }
    }
    console.log('All tokens sold.');
};
const handleUserOptions = async () => {
    const option = await prompt('Choose an option:\n1. Restart Trading\n2. Restart Bot\n3. Sell All Tokens\n');
    switch (option) {
        case '1':
            tradingPaused = false;
            break;
        case '2':
            process.exit(0);
            break;
        case '3':
            await sellAllTokens();
            break;
        default:
            console.log(chalk_1.default.red('Invalid option. Please try again.'));
            await handleUserOptions();
    }
};
const listenForPauseCommand = () => {
    (0, keypress_1.default)(process.stdin);
    process.stdin.on('keypress', async (ch, key) => {
        if (key && key.ctrl && key.name === 's') {
            console.log(chalk_1.default.yellow('Pausing trading...'));
            tradingPaused = true;
            await handleUserOptions();
        }
        if (key && key.ctrl && key.name === 'c') {
            process.exit();
        }
    });
    process.stdin.setRawMode(true);
    process.stdin.resume();
};
const startTrading = async (globalTradingFlag) => {
    const isValidToken = await validateTokenAddress(tokenAddress);
    if (!isValidToken) {
        console.error(chalk_1.default.red('Invalid token address. Please check the configuration.'));
        process.exit(1);
    }
    console.log(chalk_1.default.cyan(`Token: ${tokenName} (${tokenSymbol})`));
    const adminRaydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, adminWalletKey);
    await performSwap(adminRaydiumSwap, 'buy', swapConfig_1.swapConfig.initialAmount, 0); // Fetch the pool ID
    for (let i = 1; i <= walletKeys.length; i++) {
        (0, exports.swapLoop)(i, globalTradingFlag);
    }
    listenForPauseCommand();
};
exports.startTrading = startTrading;
//# sourceMappingURL=startTradingLiquidity.js.map