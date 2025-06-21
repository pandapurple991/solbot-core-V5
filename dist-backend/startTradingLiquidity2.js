"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
let tokenAddress = '';
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
const promptTokenAddress = () => prompt('Enter the token address: ');
const validateTokenAddress = async (address) => {
    const response = await (0, node_fetch_1.default)(`https://api.dexscreener.io/latest/dex/tokens/${address}`);
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
                console.log(chalk_1.default.magenta(`Admin Searching for Pool...`));
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
        console.error(chalk_1.default.redBright(`Error getting token balance: ${error.message}`));
        return 0;
    }
};
const getRandomAmount = (minPercentage, maxPercentage, baseAmount) => {
    const minAmount = baseAmount * (minPercentage / 100);
    const maxAmount = baseAmount * (maxPercentage / 100);
    return minAmount + Math.random() * (maxAmount - minAmount);
};
const getRandomSellAmount = (minSellPercentage, maxSellPercentage, baseAmount) => {
    const minAmount = baseAmount * (minSellPercentage / 100);
    const maxAmount = baseAmount * (maxSellPercentage / 100);
    return minAmount + Math.random() * (maxAmount - minAmount);
};
const swapLoop = async (walletNumber) => {
    try {
        const raydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, walletKeys[walletNumber - 1]);
        console.log(chalk_1.default.cyan(`Wallet ${walletNumber} - Trading is about to begin...`));
        while (true) {
            const startTime = Date.now();
            // Buy Phase
            while (Date.now() - startTime < swapConfig_1.swapConfig.buyDuration) {
                if (tradingPaused) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                const solBalance = await raydiumSwap.getBalance();
                const buyAmount = getRandomAmount(swapConfig_1.swapConfig.minPercentage, swapConfig_1.swapConfig.maxPercentage, solBalance - swapConfig_1.swapConfig.RENT_EXEMPT_FEE);
                const buyTxHash = await performSwap(raydiumSwap, 'buy', buyAmount, walletNumber);
                if (buyTxHash) {
                    const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
                    console.log(chalk_1.default.green(`Wallet ${chalk_1.default.cyan(walletNumber)} Buy ${chalk_1.default.yellow(buyAmount.toFixed(6))} SOL - Balance ${chalk_1.default.yellow(tokenBalance.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)}`));
                    console.log(chalk_1.default.green(`Successful Buy https://solscan.io/tx/${buyTxHash}`));
                }
                await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.loopInterval / 2));
                const solBalanceSecond = await raydiumSwap.getBalance();
                const buyAmountSecond = getRandomAmount(swapConfig_1.swapConfig.minPercentage, swapConfig_1.swapConfig.maxPercentage, solBalanceSecond - swapConfig_1.swapConfig.RENT_EXEMPT_FEE);
                const buyTxHashSecond = await performSwap(raydiumSwap, 'buy', buyAmountSecond, walletNumber);
                if (buyTxHashSecond) {
                    const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
                    console.log(chalk_1.default.green(`Wallet ${chalk_1.default.cyan(walletNumber)} Buy ${chalk_1.default.yellow(buyAmountSecond.toFixed(6))} SOL - Balance ${chalk_1.default.yellow(tokenBalanceSecond.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)}`));
                    console.log(chalk_1.default.green(`Successful Buy https://solscan.io/tx/${buyTxHashSecond}`));
                }
            }
            // Sell Phase
            const sellStartTime = Date.now();
            while (Date.now() - sellStartTime < swapConfig_1.swapConfig.sellDuration) {
                if (tradingPaused) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
                if (tokenBalance > 0) {
                    const sellAmount = getRandomSellAmount(swapConfig_1.swapConfig.minSellPercentage, swapConfig_1.swapConfig.maxSellPercentage, tokenBalance);
                    const sellTxHash = await performSwap(raydiumSwap, 'sell', sellAmount, walletNumber);
                    if (sellTxHash) {
                        const solBalance = await raydiumSwap.getBalance();
                        console.log(chalk_1.default.red(`Wallet ${chalk_1.default.cyan(walletNumber)} Sell ${chalk_1.default.yellow(sellAmount.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)} - Balance ${chalk_1.default.yellow(solBalance.toFixed(6))} SOL`));
                        console.log(chalk_1.default.red(`Successful Sell https://solscan.io/tx/${sellTxHash}`));
                    }
                    await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.loopInterval / 2));
                    const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
                    if (tokenBalanceSecond > 0) {
                        const sellAmountSecond = getRandomSellAmount(swapConfig_1.swapConfig.minSellPercentage, swapConfig_1.swapConfig.maxSellPercentage, tokenBalanceSecond);
                        const sellTxHashSecond = await performSwap(raydiumSwap, 'sell', sellAmountSecond, walletNumber);
                        if (sellTxHashSecond) {
                            const solBalanceSecond = await raydiumSwap.getBalance();
                            console.log(chalk_1.default.red(`Wallet ${chalk_1.default.cyan(walletNumber)} Sell ${chalk_1.default.yellow(sellAmountSecond.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)} - Balance ${chalk_1.default.yellow(solBalanceSecond.toFixed(6))} SOL`));
                            console.log(chalk_1.default.red(`Successful Sell https://solscan.io/tx/${sellTxHashSecond}`));
                        }
                    }
                }
            }
        }
    }
    catch (error) {
        console.error(chalk_1.default.redBright(`Error in swap loop for wallet ${walletNumber}: ${error.message}`));
    }
};
const sellAllTokens = async () => {
    console.log('Selling all tokens...');
    for (let index = 0; index < walletKeys.length; index++) {
        const key = walletKeys[index];
        const walletNumber = index + 1;
        const raydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, key);
        console.log(`Wallet ${walletNumber} - Checking token balance...`);
        let tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
        while (tokenBalance >= 5) {
            console.log(chalk_1.default.yellow(`Wallet ${walletNumber} - Found token balance: ${tokenBalance.toFixed(2)} ${tokenSymbol}`));
            console.log(`Wallet ${walletNumber} - Selling ${tokenBalance.toFixed(2)} ${tokenSymbol}...`);
            let sellTxHash;
            for (let attempt = 1; attempt <= swapConfig_1.swapConfig.maxRetries; attempt++) {
                try {
                    sellTxHash = await performSwap(raydiumSwap, 'sell', tokenBalance, walletNumber);
                    if (sellTxHash) {
                        console.log(`Wallet ${walletNumber} - Successful Sell https://solscan.io/tx/${sellTxHash}`);
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
            tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
        }
    }
    console.log('All tokens sold.');
};
const handleUserOptions = async () => {
    const option = await prompt('Choose an option:\n1. Restart Trading\n2. Restart Bot\n3. Send All Sol to Admin\n4. Sell All Tokens\n');
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
const startTrading = async () => {
    tokenAddress = await promptTokenAddress();
    const isValidToken = await validateTokenAddress(tokenAddress);
    if (!isValidToken) {
        console.error(chalk_1.default.red('Invalid token address. Please try again.'));
        process.exit(1);
    }
    console.log(chalk_1.default.cyan(`Token: ${tokenName} (${tokenSymbol})`));
    const adminRaydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, adminWalletKey);
    await performSwap(adminRaydiumSwap, 'buy', swapConfig_1.swapConfig.initialAmount, 0); // Fetch the pool ID
    for (let i = 1; i <= walletKeys.length; i++) {
        swapLoop(i);
    }
    listenForPauseCommand();
};
startTrading();
//# sourceMappingURL=startTradingLiquidity2.js.map