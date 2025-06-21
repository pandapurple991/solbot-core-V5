"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeTokenAccountsAndSendBalance = closeTokenAccountsAndSendBalance;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const chalk_1 = __importDefault(require("chalk"));
const bs58_1 = __importDefault(require("bs58"));
const startTrading_1 = require("./startTrading");
const utility_1 = require("./utility");
const swapConfig_1 = require("./swapConfig");
const RaydiumSwap_1 = __importDefault(require("./RaydiumSwap"));
const { maxRetries, retryInterval } = swapConfig_1.swapConfig;
async function retryOperation(operation, retries, interval) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            console.log(chalk_1.default.red(`Attempt ${attempt} failed: ${error.message}`));
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, interval));
            }
            else {
                throw new Error(`Operation failed after ${retries} attempts: ${error.message}`);
            }
        }
    }
}
async function closeTokenAccountsAndSendBalance(adminWallet, tradingWallets, tokenAddress, connection) {
    console.log(chalk_1.default.blueBright('Starting the process to close token accounts and send balance to admin wallet...'));
    for (let i = 0; i < tradingWallets.length; i++) {
        const wallet = tradingWallets[i];
        const walletNumber = i + 1;
        const walletKeypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(wallet.privateKey));
        const adminKeypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(adminWallet.privateKey));
        console.log(chalk_1.default.magentaBright(`Processing wallet #${chalk_1.default.cyan(walletNumber)}: ${chalk_1.default.blue(wallet.publicKey)}`));
        try {
            const raydiumSwap = new RaydiumSwap_1.default(process.env.RPC_URL, wallet.privateKey);
            const tokenBalance = await (0, startTrading_1.getTokenBalance)(raydiumSwap, tokenAddress);
            if (tokenBalance > 0) {
                const decimals = await raydiumSwap.getTokenDecimals(tokenAddress);
                console.log(chalk_1.default.yellow(`Burning ${chalk_1.default.white(tokenBalance)} tokens from wallet ${chalk_1.default.blue(wallet.publicKey)}`));
                // Burn the tokens
                await retryOperation(async () => {
                    const burnTxHash = await (0, spl_token_1.burnChecked)(connection, adminKeypair, // fee payer
                    await (0, utility_1.getOrCreateAssociatedTokenAccount)(connection, adminWallet, wallet, new web3_js_1.PublicKey(tokenAddress)), // token account
                    new web3_js_1.PublicKey(tokenAddress), // mint
                    walletKeypair, // owner
                    BigInt(tokenBalance * Math.pow(10, decimals)), // amount
                    decimals // decimals
                    );
                    console.log(chalk_1.default.green(`Burned ${chalk_1.default.white(tokenBalance)} tokens from wallet ${chalk_1.default.blue(wallet.publicKey)}. Transaction hash: ${chalk_1.default.white(burnTxHash)}`));
                }, maxRetries, retryInterval);
                // Close the token account
                await retryOperation(async () => {
                    const closeTxHash = await (0, spl_token_1.closeAccount)(connection, adminKeypair, // fee payer
                    await (0, utility_1.getOrCreateAssociatedTokenAccount)(connection, adminWallet, wallet, new web3_js_1.PublicKey(tokenAddress)), // token account
                    new web3_js_1.PublicKey(adminWallet.publicKey), // destination (admin wallet)
                    walletKeypair // owner of token account
                    );
                    console.log(chalk_1.default.green(`Closed token account for wallet ${chalk_1.default.blue(wallet.publicKey)}. Transaction hash: ${chalk_1.default.white(closeTxHash)}`));
                }, maxRetries, retryInterval);
            }
            else {
                console.log(chalk_1.default.yellow(`No tokens to burn for wallet ${chalk_1.default.blue(wallet.publicKey)}`));
            }
            // Send SOL balance to admin wallet
            const solBalance = await (0, utility_1.getSolBalance)(wallet, connection);
            if (solBalance > 0) {
                const lamportsToSend = Math.floor(solBalance * web3_js_1.LAMPORTS_PER_SOL);
                await retryOperation(async () => {
                    const transferTransaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
                        fromPubkey: walletKeypair.publicKey,
                        toPubkey: adminKeypair.publicKey,
                        lamports: lamportsToSend,
                    }));
                    const transferTxHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transferTransaction, [walletKeypair, adminKeypair]);
                    console.log(chalk_1.default.green(`Transferred ${chalk_1.default.white(solBalance)} SOL from wallet ${chalk_1.default.blue(wallet.publicKey)} to admin wallet. Transaction hash: ${chalk_1.default.white(transferTxHash)}`));
                }, maxRetries, retryInterval);
            }
            else {
                console.log(chalk_1.default.yellow(`No SOL to transfer for wallet ${chalk_1.default.blue(wallet.publicKey)}`));
            }
        }
        catch (error) {
            console.log(chalk_1.default.red(`Error processing wallet ${chalk_1.default.blue(wallet.publicKey)}: ${chalk_1.default.white(error.message)}`));
        }
    }
    console.log(chalk_1.default.blueBright('Completed the process of closing token accounts and sending balances to admin wallet.'));
}
//# sourceMappingURL=addedOptions.js.map