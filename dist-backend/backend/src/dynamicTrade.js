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
exports.dynamicTrade = dynamicTrade;
const utility_1 = require("./utility");
const swapConfig_1 = require("./swapConfig");
const chalk_1 = __importDefault(require("chalk"));
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const startTrading_1 = require("./startTrading");
const liquidityPhaseTrading_1 = require("./liquidityPhaseTrading");
const RaydiumSwap_1 = __importDefault(require("./RaydiumSwap"));
const path = __importStar(require("path"));
const wallet_1 = __importDefault(require("./wallet"));
const bs58_1 = __importDefault(require("bs58"));
const { TRADE_DURATION_MAKER, TRADE_DURATION_VOLUME, SESSION_DIR, maxRetries, maxLamports, TOKEN_TRANSFER_THRESHOLD, RENT_EXEMPT_FEE } = swapConfig_1.swapConfig;
async function collectSolAndTokensFromTradingWallets(adminWallet, tradingWallets, tokenAddress, connection) {
    const sendTokenTransaction = async (wallet) => {
        const walletInstance = wallet_1.default.fromPrivateKey(wallet.privateKey, wallet.number);
        const raydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, walletInstance.privateKey);
        let tokenBalance = await (0, startTrading_1.getTokenBalance)(raydiumSwap, tokenAddress);
        let attempt = 0;
        while (tokenBalance > TOKEN_TRANSFER_THRESHOLD && attempt < maxRetries) { // Ensure no more than 20 tokens remain
            attempt++;
            const decimals = await raydiumSwap.getTokenDecimals(tokenAddress);
            const amountToSend = tokenBalance - TOKEN_TRANSFER_THRESHOLD;
            const fromTokenAccountPubkey = await (0, utility_1.getOrCreateAssociatedTokenAccount)(connection, adminWallet, // Admin wallet as fee payer
            walletInstance, new web3_js_1.PublicKey(tokenAddress));
            const toTokenAccountPubkey = await (0, utility_1.getOrCreateAssociatedTokenAccount)(connection, adminWallet, // Admin wallet as fee payer
            adminWallet, new web3_js_1.PublicKey(tokenAddress));
            const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createTransferCheckedInstruction)(fromTokenAccountPubkey, new web3_js_1.PublicKey(tokenAddress), toTokenAccountPubkey, new web3_js_1.PublicKey(walletInstance.publicKey), BigInt(Math.floor(amountToSend * Math.pow(10, decimals))), // Convert token balance to integer
            decimals));
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = new web3_js_1.PublicKey(adminWallet.publicKey);
            const keypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(walletInstance.privateKey));
            const adminKeypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(adminWallet.privateKey));
            transaction.partialSign(keypair);
            transaction.partialSign(adminKeypair);
            try {
                await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair, adminKeypair]);
                console.log(chalk_1.default.cyanBright(`Transferred tokens from ${chalk_1.default.gray(wallet.publicKey)} to ${chalk_1.default.gray(adminWallet.publicKey)}`));
                break; // Exit the loop on success
            }
            catch (error) {
                console.log(chalk_1.default.red(`Attempt ${chalk_1.default.cyan(attempt)} failed to transfer tokens from ${chalk_1.default.gray(wallet.publicKey)}: ${chalk_1.default.red(error.message)}`));
                if (attempt >= maxRetries) {
                    console.log(chalk_1.default.red(`Failed to transfer tokens from ${chalk_1.default.gray(wallet.publicKey)} after ${chalk_1.default.white(maxRetries)} attempts. Moving on.`));
                }
            }
            tokenBalance = await (0, startTrading_1.getTokenBalance)(raydiumSwap, tokenAddress);
            await new Promise(resolve => setTimeout(resolve, 700)); // 0.7-second delay
        }
        return attempt < maxRetries; // Return success if attempts are less than maxRetries
    };
    const sendSolTransaction = async (wallet) => {
        const walletInstance = wallet_1.default.fromPrivateKey(wallet.privateKey, wallet.number);
        const solBalance = await (0, utility_1.getSolBalance)(walletInstance, connection);
        const amountToSend = Math.floor(solBalance * web3_js_1.LAMPORTS_PER_SOL) - maxLamports - RENT_EXEMPT_FEE; // Only subtract necessary fees once
        let attempt = 0;
        while (amountToSend > 0 && attempt < maxRetries) {
            attempt++;
            const transaction = new web3_js_1.Transaction();
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = new web3_js_1.PublicKey(adminWallet.publicKey);
            const adminKeypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(adminWallet.privateKey));
            const walletKeypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(wallet.privateKey));
            transaction.add(web3_js_1.SystemProgram.transfer({
                fromPubkey: new web3_js_1.PublicKey(walletInstance.publicKey),
                toPubkey: new web3_js_1.PublicKey(adminWallet.publicKey),
                lamports: amountToSend
            }));
            transaction.partialSign(walletKeypair);
            transaction.partialSign(adminKeypair);
            try {
                await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [walletKeypair, adminKeypair]);
                console.log(chalk_1.default.blueBright(`Transferred ${chalk_1.default.white(amountToSend / web3_js_1.LAMPORTS_PER_SOL)} SOL from ${chalk_1.default.gray(wallet.publicKey)} to ${chalk_1.default.gray(adminWallet.publicKey)}`));
                break; // Exit the loop on success
            }
            catch (error) {
                console.log(chalk_1.default.red(`Attempt ${chalk_1.default.blueBright(attempt)} failed to transfer SOL from ${chalk_1.default.cyan(wallet.publicKey)}: ${chalk_1.default.red(error.message)}`));
                if (attempt >= maxRetries) {
                    console.log(chalk_1.default.red(`Failed to transfer SOL from ${chalk_1.default.gray(wallet.publicKey)} after ${chalk_1.default.white(maxRetries)} attempts. Moving on.`));
                }
            }
            await new Promise(resolve => setTimeout(resolve, 700)); // 0.7-second delay
        }
        return attempt < maxRetries; // Return success if attempts are less than maxRetries
    };
    // Function to process all token transactions in parallel with delays
    const processTokenTransactions = async () => {
        await Promise.all(tradingWallets.map(async (wallet, index) => {
            await new Promise(resolve => setTimeout(resolve, index * 700)); // 700 ms delay between each transaction
            return sendTokenTransaction(wallet);
        }));
    };
    // Function to process all SOL transactions in parallel with delays
    const processSolTransactions = async () => {
        await Promise.all(tradingWallets.map(async (wallet, index) => {
            await new Promise(resolve => setTimeout(resolve, index * 700)); // 700 ms delay between each transaction
            return sendSolTransaction(wallet);
        }));
    };
    // Process tokens first
    console.log(chalk_1.default.white('Starting token transfers...'));
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    await processTokenTransactions();
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay after token transfers
    console.log(chalk_1.default.greenBright('All token transfers completed.'));
    // Process SOL next
    console.log(chalk_1.default.white('Starting SOL transfers...'));
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    await processSolTransactions();
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay after SOL transfers
    console.log(chalk_1.default.greenBright('All SOL transfers completed.'));
    return {
        tokenTransfersCompleted: true,
        solTransfersCompleted: true,
    };
}
async function logTradingLapResults(adminWallet, tradingWallets, tokenAddress, connection, lapNumber) {
    let totalTokenBalance = 0;
    let totalSolBalance = 0;
    for (const wallet of tradingWallets) {
        const solBalance = await (0, utility_1.getSolBalance)(wallet, connection);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        totalSolBalance += solBalance;
        const raydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, wallet.privateKey);
        const tokenBalance = await (0, startTrading_1.getTokenBalance)(raydiumSwap, tokenAddress);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        totalTokenBalance += tokenBalance;
    }
    const adminSolBalanceBefore = await (0, utility_1.getSolBalance)(adminWallet, connection);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    const adminTokenBalanceBefore = await (0, startTrading_1.getTokenBalance)(new RaydiumSwap_1.default(process.env.RPC_URL, adminWallet.privateKey), tokenAddress);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    console.log(chalk_1.default.cyanBright(`Trading Lap ${lapNumber} Results:
    Total Combined SOL Balance of Trading Wallets: ${chalk_1.default.white(totalSolBalance.toFixed(6))} SOL
    Admin Wallet Balance Before Collecting SOL: ${chalk_1.default.white(adminSolBalanceBefore.toFixed(6))} SOL
    Admin Wallet Token Balance Before Collecting Tokens: ${chalk_1.default.white(adminTokenBalanceBefore.toFixed(6))}`));
    // Introduce a 5-second delay before collecting SOL and token balances
    await new Promise(resolve => setTimeout(resolve, 5000));
    const collectionResults = await collectSolAndTokensFromTradingWallets(adminWallet, tradingWallets, tokenAddress, connection);
    if (!collectionResults.tokenTransfersCompleted || !collectionResults.solTransfersCompleted) {
        console.log(chalk_1.default.red('Error in collecting SOL or Tokens. Aborting trading lap.'));
        return { totalSolCollected: 0, totalTokensCollected: 0 };
    }
    const adminSolBalanceAfter = await (0, utility_1.getSolBalance)(adminWallet, connection);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    const adminTokenBalanceAfter = await (0, startTrading_1.getTokenBalance)(new RaydiumSwap_1.default(process.env.RPC_URL, adminWallet.privateKey), tokenAddress);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    const totalSolCollected = adminSolBalanceAfter - adminSolBalanceBefore;
    const totalTokensCollected = adminTokenBalanceAfter - adminTokenBalanceBefore;
    console.log(chalk_1.default.cyanBright(`Admin Wallet Balance After Collecting SOL: ${adminSolBalanceAfter.toFixed(6)} SOL
    Admin Wallet Balance After Collecting Tokens: ${adminTokenBalanceAfter.toFixed(6)} Tokens
    Total SOL Collected: ${totalSolCollected.toFixed(6)}
    Total Tokens Collected: ${totalTokensCollected.toFixed(6)}`));
    return { totalSolCollected, totalTokensCollected };
}
function formatElapsedTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
}
const getElapsedTime = (startTime, pauseStartTimes, resumeTimes) => {
    let pausedDuration = 0;
    for (let i = 0; i < pauseStartTimes.length; i++) {
        const pauseStart = pauseStartTimes[i];
        const resumeTime = resumeTimes[i] || Date.now();
        pausedDuration += resumeTime - pauseStart;
    }
    return Date.now() - startTime - pausedDuration;
};
const TIMEOUT_DURATION = 120000;
function timeoutPromise(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);
}
async function dynamicTrade(adminWallet, tradingWallets, tokenAddress, tradeStrategy, connection, sessionTimestamp, tokenName, globalTradingFlag) {
    // Handle Liquidity Phase Trading as a special case
    if (tradeStrategy === 'LIQUIDITY_PHASE_TRADING') {
        console.log(chalk_1.default.cyan('Starting Liquidity Phase Trading...'));
        globalTradingFlag.value = true;
        await (0, liquidityPhaseTrading_1.startLiquidityPhaseTrading)(adminWallet, tradingWallets, tokenAddress, connection, globalTradingFlag);
        return; // Exit early for liquidity phase trading
    }
    let lapNumber = 1;
    const duration = tradeStrategy === 'INCREASE_MAKERS_VOLUME' ? TRADE_DURATION_MAKER : TRADE_DURATION_VOLUME;
    const pauseStartTimes = [];
    const resumeTimes = [];
    let continueTrading = true;
    while (continueTrading) {
        let elapsedTime = 0;
        let lapStartTime = Date.now();
        console.log(chalk_1.default.white(`Starting Trading Lap ${lapNumber}...`));
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        globalTradingFlag.value = true;
        await (0, startTrading_1.startTrading)(globalTradingFlag);
        while (elapsedTime < duration) {
            if (!globalTradingFlag.value) {
                const pauseStartTime = Date.now();
                pauseStartTimes.push(pauseStartTime);
                while (!globalTradingFlag.value) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                const resumeTime = Date.now();
                resumeTimes.push(resumeTime);
            }
            elapsedTime = getElapsedTime(lapStartTime, pauseStartTimes, resumeTimes);
            if (elapsedTime % 15000 < 1000) {
                const timeLeft = duration - elapsedTime;
                console.log(chalk_1.default.magenta(`Time left in session: ${chalk_1.default.white(formatElapsedTime(timeLeft))}`));
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log(chalk_1.default.white('Trade duration met. Stopping trading.'));
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay
        globalTradingFlag.value = false;
        let totalSolCollected = 0;
        let totalTokensCollected = 0;
        try {
            const results = await timeoutPromise(logTradingLapResults(adminWallet, tradingWallets, tokenAddress, connection, lapNumber), TIMEOUT_DURATION);
            totalSolCollected = results.totalSolCollected;
            totalTokensCollected = results.totalTokensCollected;
        }
        catch (error) {
            console.log(chalk_1.default.red(`Error or timeout during SOL and token collection: ${error.message}`));
        }
        if (totalSolCollected === 0 && totalTokensCollected === 0) {
            console.log(chalk_1.default.red('No funds collected. Stopping trading.'));
            continueTrading = false;
            continue;
        }
        const numWallets = tradingWallets.length;
        const newWallets = Array.from({ length: numWallets }, () => new wallet_1.default());
        tradingWallets = newWallets;
        console.log(chalk_1.default.green(`Generated ${numWallets} new wallets for next trading round.`));
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        const currentSessionFilePath = path.join(SESSION_DIR, `${tokenName}_${sessionTimestamp}_session.json`);
        if (!await (0, utility_1.appendWalletsToSession)(newWallets, currentSessionFilePath)) {
            console.log(chalk_1.default.redBright('Error saving session after new wallet generation. Exiting...'));
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        // Show trading lap results after saving session file
        console.log(chalk_1.default.cyan(`Lap ${chalk_1.default.white(lapNumber)} complete. Results:`));
        console.log(chalk_1.default.blueBright(`Total SOL collected: ${chalk_1.default.white(totalSolCollected.toFixed(6))} SOL`));
        console.log(chalk_1.default.blueBright(`Total Tokens collected: ${chalk_1.default.white(totalTokensCollected.toFixed(6))} Tokens`));
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        // Notify before distributing tokens
        console.log(chalk_1.default.white('Starting token distribution...'));
        let successWallets = [];
        try {
            await timeoutPromise((0, utility_1.distributeTokens)(adminWallet, new web3_js_1.PublicKey(adminWallet.publicKey), tradingWallets, new web3_js_1.PublicKey(tokenAddress), totalTokensCollected, 9, connection), TIMEOUT_DURATION);
            console.log(chalk_1.default.greenBright(`Successfully distributed Tokens to ${chalk_1.default.white(successWallets.length)} wallets for the next round.`));
        }
        catch (error) {
            console.log(chalk_1.default.red(`Error or timeout during token distribution: ${error.message}`));
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        // Notify before distributing SOL
        console.log(chalk_1.default.white('Starting SOL distribution...'));
        try {
            const distributeResult = await timeoutPromise((0, utility_1.distributeSol)(adminWallet, tradingWallets, totalSolCollected, connection), TIMEOUT_DURATION);
            successWallets = distributeResult.successWallets;
            console.log(chalk_1.default.greenBright(`Successfully distributed SOL to ${chalk_1.default.white(successWallets.length)} wallets for the next round.`));
        }
        catch (error) {
            console.log(chalk_1.default.red(`Error or timeout during SOL distribution: ${error.message}`));
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        tradingWallets = successWallets;
        lapNumber++;
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
    }
    globalTradingFlag.value = false;
    console.log(chalk_1.default.white('Trade duration met. Stopping trading.'));
}
//# sourceMappingURL=dynamicTrade.js.map