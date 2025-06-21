"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenBalance = exports.liquidityPhaseSwapLoop = exports.startLiquidityPhaseTrading = void 0;
const RaydiumSwap_1 = __importDefault(require("./RaydiumSwap"));
const swapConfig_1 = require("./swapConfig");
const chalk_1 = __importDefault(require("chalk"));
const pool_keys_1 = require("./pool-keys");
// Adapted from startTradingLiquidity2.ts for session-based integration
// This preserves the unique timed buy phase → timed sell phase pattern
let poolInfoCache = null;
let poolInfoReady = false;
let tokenName = '';
let tokenSymbol = '';
let tradingPaused = false;
const validateTokenAddress = async (tokenAddress) => {
    try {
        const response = await fetch(`https://api.dexscreener.io/latest/dex/tokens/${tokenAddress}`);
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
            const { baseToken } = data.pairs[0];
            tokenName = baseToken.name;
            tokenSymbol = baseToken.symbol;
            return true;
        }
        return false;
    }
    catch (error) {
        console.error(`Error validating token: ${error.message}`);
        return false;
    }
};
const performSwap = async (raydiumSwap, direction, amount, walletNumber, tokenAddress) => {
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
const getRandomSellAmount = (minSellPercentage, maxSellPercentage, baseAmount) => {
    const minAmount = baseAmount * (minSellPercentage / 100);
    const maxAmount = baseAmount * (maxSellPercentage / 100);
    return minAmount + Math.random() * (maxAmount - minAmount);
};
const liquidityPhaseSwapLoop = async (wallet, walletNumber, tokenAddress, connection, globalTradingFlag) => {
    try {
        const raydiumSwap = new RaydiumSwap_1.default(swapConfig_1.swapConfig.RPC_URL, wallet.privateKey);
        console.log(chalk_1.default.cyan(`Wallet ${walletNumber} - Liquidity Phase Trading is about to begin...`));
        while (globalTradingFlag.value) {
            const startTime = Date.now();
            // Buy Phase - Continuous buying for buyDuration
            console.log(chalk_1.default.blueBright(`Wallet ${walletNumber} - Starting BUY PHASE (${swapConfig_1.swapConfig.buyDuration / 1000}s)`));
            while (globalTradingFlag.value && Date.now() - startTime < swapConfig_1.swapConfig.buyDuration) {
                if (tradingPaused) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                const solBalance = await raydiumSwap.getBalance();
                const buyAmount = getRandomAmount(swapConfig_1.swapConfig.minPercentage, swapConfig_1.swapConfig.maxPercentage, solBalance - swapConfig_1.swapConfig.RENT_EXEMPT_FEE);
                const buyTxHash = await performSwap(raydiumSwap, 'buy', buyAmount, walletNumber, tokenAddress);
                if (buyTxHash) {
                    const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
                    console.log(chalk_1.default.green(`Wallet ${chalk_1.default.cyan(walletNumber)} Buy ${chalk_1.default.yellow(buyAmount.toFixed(6))} SOL - Balance ${chalk_1.default.yellow(tokenBalance.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)}`));
                    console.log(chalk_1.default.green(`Successful Buy https://solscan.io/tx/${buyTxHash}`));
                }
                await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.loopInterval / 2));
                // Second buy in same loop iteration
                if (globalTradingFlag.value && Date.now() - startTime < swapConfig_1.swapConfig.buyDuration) {
                    const solBalanceSecond = await raydiumSwap.getBalance();
                    const buyAmountSecond = getRandomAmount(swapConfig_1.swapConfig.minPercentage, swapConfig_1.swapConfig.maxPercentage, solBalanceSecond - swapConfig_1.swapConfig.RENT_EXEMPT_FEE);
                    const buyTxHashSecond = await performSwap(raydiumSwap, 'buy', buyAmountSecond, walletNumber, tokenAddress);
                    if (buyTxHashSecond) {
                        const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
                        console.log(chalk_1.default.green(`Wallet ${chalk_1.default.cyan(walletNumber)} Buy ${chalk_1.default.yellow(buyAmountSecond.toFixed(6))} SOL - Balance ${chalk_1.default.yellow(tokenBalanceSecond.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)}`));
                        console.log(chalk_1.default.green(`Successful Buy https://solscan.io/tx/${buyTxHashSecond}`));
                    }
                }
            }
            if (!globalTradingFlag.value)
                break;
            // Sell Phase - Continuous selling for sellDuration
            console.log(chalk_1.default.magentaBright(`Wallet ${walletNumber} - Starting SELL PHASE (${swapConfig_1.swapConfig.sellDuration / 1000}s)`));
            const sellStartTime = Date.now();
            while (globalTradingFlag.value && Date.now() - sellStartTime < swapConfig_1.swapConfig.sellDuration) {
                if (tradingPaused) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
                if (tokenBalance > 0) {
                    const sellAmount = getRandomSellAmount(swapConfig_1.swapConfig.minSellPercentage, swapConfig_1.swapConfig.maxSellPercentage, tokenBalance);
                    const sellTxHash = await performSwap(raydiumSwap, 'sell', sellAmount, walletNumber, tokenAddress);
                    if (sellTxHash) {
                        const solBalance = await raydiumSwap.getBalance();
                        console.log(chalk_1.default.red(`Wallet ${chalk_1.default.cyan(walletNumber)} Sell ${chalk_1.default.yellow(sellAmount.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)} - Balance ${chalk_1.default.yellow(solBalance.toFixed(6))} SOL`));
                        console.log(chalk_1.default.red(`Successful Sell https://solscan.io/tx/${sellTxHash}`));
                    }
                    await new Promise(resolve => setTimeout(resolve, swapConfig_1.swapConfig.loopInterval / 2));
                    // Second sell in same loop iteration
                    if (globalTradingFlag.value && Date.now() - sellStartTime < swapConfig_1.swapConfig.sellDuration) {
                        const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
                        if (tokenBalanceSecond > 0) {
                            const sellAmountSecond = getRandomSellAmount(swapConfig_1.swapConfig.minSellPercentage, swapConfig_1.swapConfig.maxSellPercentage, tokenBalanceSecond);
                            const sellTxHashSecond = await performSwap(raydiumSwap, 'sell', sellAmountSecond, walletNumber, tokenAddress);
                            if (sellTxHashSecond) {
                                const solBalanceSecond = await raydiumSwap.getBalance();
                                console.log(chalk_1.default.red(`Wallet ${chalk_1.default.cyan(walletNumber)} Sell ${chalk_1.default.yellow(sellAmountSecond.toFixed(6))} ${chalk_1.default.yellow(tokenSymbol)} - Balance ${chalk_1.default.yellow(solBalanceSecond.toFixed(6))} SOL`));
                                console.log(chalk_1.default.red(`Successful Sell https://solscan.io/tx/${sellTxHashSecond}`));
                            }
                        }
                    }
                }
            }
            // Brief pause between cycles
            console.log(chalk_1.default.white(`Wallet ${walletNumber} - Cycle complete, brief pause before next cycle...`));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    catch (error) {
        console.error(chalk_1.default.redBright(`Error in liquidity phase swap loop for wallet ${walletNumber}: ${error.message}`));
    }
};
exports.liquidityPhaseSwapLoop = liquidityPhaseSwapLoop;
// Main function for Liquidity Phase Trading
const startLiquidityPhaseTrading = async (adminWallet, tradingWallets, tokenAddress, connection, globalTradingFlag) => {
    try {
        // Validate token address and get token info
        const isValidToken = await validateTokenAddress(tokenAddress);
        if (!isValidToken) {
            console.error(chalk_1.default.red('Invalid token address for liquidity phase trading.'));
            return false;
        }
        console.log(chalk_1.default.cyan(`Liquidity Phase Trading - Token: ${tokenName} (${tokenSymbol})`));
        console.log(chalk_1.default.blueBright(`Buy Phase Duration: ${swapConfig_1.swapConfig.buyDuration / 1000}s | Sell Phase Duration: ${swapConfig_1.swapConfig.sellDuration / 1000}s`));
        // Initialize pool with admin wallet
        const adminRaydiumSwap = new RaydiumSwap_1.default(swapConfig_1.swapConfig.RPC_URL, adminWallet.privateKey);
        await performSwap(adminRaydiumSwap, 'buy', swapConfig_1.swapConfig.initialAmount, 0, tokenAddress); // Fetch the pool ID
        // Start liquidity phase trading for all wallets
        const tradingPromises = tradingWallets.map((wallet, index) => liquidityPhaseSwapLoop(wallet, index + 1, tokenAddress, connection, globalTradingFlag));
        await Promise.all(tradingPromises);
        console.log(chalk_1.default.green('Liquidity Phase Trading completed for all wallets'));
        return true;
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error in Liquidity Phase Trading: ${error.message}`));
        return false;
    }
};
exports.startLiquidityPhaseTrading = startLiquidityPhaseTrading;
