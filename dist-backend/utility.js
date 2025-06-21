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
exports.formatTimestampToEST = formatTimestampToEST;
exports.getSolBalance = getSolBalance;
exports.sendSol = sendSol;
exports.saveSession = saveSession;
exports.appendWalletsToSession = appendWalletsToSession;
exports.createWalletWithNumber = createWalletWithNumber;
exports.loadSession = loadSession;
exports.distributeSol = distributeSol;
exports.getOrCreateAssociatedTokenAccount = getOrCreateAssociatedTokenAccount;
exports.distributeTokens = distributeTokens;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const date_fns_1 = require("date-fns");
const date_fns_tz_1 = require("date-fns-tz");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const swapConfig_1 = require("./swapConfig");
const chalk_1 = __importDefault(require("chalk"));
const wallet_1 = __importDefault(require("./wallet"));
const bs58_1 = __importDefault(require("bs58"));
const { SESSION_DIR } = swapConfig_1.swapConfig;
function formatTimestampToEST(date) {
    const timeZone = 'America/New_York';
    const zonedDate = (0, date_fns_tz_1.toZonedTime)(date, timeZone);
    return (0, date_fns_1.format)(zonedDate, 'MM.dd.yyyy_hh.mm.ssaaa');
}
async function getSolBalance(wallet, connection) {
    const keypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(wallet.privateKey));
    const balance = await connection.getBalance(keypair.publicKey);
    return balance / 1e9; // Convert lamports to SOL
}
async function sendSol(fromWallet, toPublicKey, amountSol, connection) {
    const fromKeypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(fromWallet.privateKey));
    const lamports = Math.floor(amountSol * web3_js_1.LAMPORTS_PER_SOL); // Ensure amount is an integer
    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: lamports,
    }));
    // Fetch latest blockhash and set it in the transaction
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromKeypair.publicKey;
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [fromKeypair]);
    console.log(chalk_1.default.yellow(`Sent ${chalk_1.default.white(amountSol)} SOL from ${chalk_1.default.gray(fromKeypair.publicKey.toBase58())} to ${chalk_1.default.gray(toPublicKey.toBase58())}, tx hash: ${chalk_1.default.gray(signature)}`));
    return signature;
}
async function retrySaveSession(fileName, sessionData, retries, delay) {
    for (let i = 0; i < retries; i++) {
        try {
            await fs.promises.writeFile(fileName, JSON.stringify(sessionData, null, 2));
            const savedData = JSON.parse(await fs.promises.readFile(fileName, 'utf-8'));
            if (JSON.stringify(savedData) === JSON.stringify(sessionData)) {
                return true;
            }
            throw new Error('Session verification failed');
        }
        catch (error) {
            console.log(chalk_1.default.red(`Failed to save session (attempt ${i + 1}): ${error.message}`));
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            else {
                return false;
            }
        }
    }
    return false;
}
function updateEnvFile(adminWallet, newWallets, tokenAddress) {
    try {
        // Paths to the .env and freeze.env files
        const envFilePath = path.resolve('.env');
        const freezeEnvFilePath = path.resolve('C:\\Users\\gambl\\Documents\\Freeze Bot\\freeze.env');
        // Generate the new content for the .env file
        let newEnvContent = `RPC_URL=https://serene-green-waterfall.solana-mainnet.quiknode.pro/f8c6f111811d71021ebbda753f89452e6820735a/\n`;
        newEnvContent += `ADMIN_WALLET_PRIVATE_KEY=${adminWallet.privateKey}\n`;
        newEnvContent += `TOKEN_ADDRESS=${tokenAddress}\n`;
        newWallets.forEach((wallet, index) => {
            newEnvContent += `WALLET_PRIVATE_KEY_${index + 1}=${wallet.privateKey}\n`;
        });
        // Write the new content to the .env file
        fs.writeFileSync(envFilePath, newEnvContent);
        // Generate content for the freeze.env file
        let freezeEnvContent = `ADMIN_WALLET_PUBLIC_KEY=${adminWallet.publicKey}\n`;
        freezeEnvContent += `ADMIN_WALLET_PRIVATE_KEY=${adminWallet.privateKey}\n`;
        freezeEnvContent += `TOKEN_ADDRESS=${tokenAddress}\n`;
        freezeEnvContent += `BITQUERY_API_KEY=BQYe6ySJAI2oWxKLY0ucD87HtrbmE3e8\n`;
        freezeEnvContent += `AUTH_TOKEN=ory_at_HBXFvpNndrSZ5-mUMZ8SejV7bo_biHiHt_EDyVJ0-iI.dnJH3mktxZtUrf50tIh7N0YwSDK2v7kfOhKnHYAfMCI\n`;
        freezeEnvContent += `RPC_ENDPOINT=https://polished-necessary-sheet.solana-mainnet.quiknode.pro/012b796c3f9180c9e901a90745459effec1bcaeb/\n`;
        freezeEnvContent += `WS_ENDPOINT=https://misty-wild-market.solana-mainnet.quiknode.pro/3455264616be262cbac6e42eb4590b3e1eee46d9/\n`;
        freezeEnvContent += `FREEZE_THRESHOLD=100\n`;
        // Add provided public keys
        const providedPublicKeys = [
            'EAJ8mmeaoHRX97db5GZ9d7rMLQgKC58kzbuzhmtxmXmB',
            'J5DQKPBtJcgEhVWWMDzGVhEeqyVy1KBoreYStqb8P6Tc',
            'Dq1SJtydaxXeLhTTm2CgeyPRfaV5WpjRJaGNtGDbZNuH',
            '3GTGuLuYLdKApqdSDFMKm5xJqbXFzHEZsjBtYf1avXQQ',
            '9VqiQ6JGTxGrhmvtUzHbm5ovwBftgfuWS9fytTU79BtG',
            'AYV6ZkP6MqdGPoVBZ79AQnDWHmTt5ieXcqCNW7XbDHYS'
        ];
        providedPublicKeys.forEach((publicKey, index) => {
            freezeEnvContent += `WALLET_PUBLIC_KEY_${index + 1}=${publicKey}\n`;
        });
        newWallets.forEach((wallet, index) => {
            freezeEnvContent += `WALLET_PUBLIC_KEY_${providedPublicKeys.length + index + 1}=${wallet.publicKey}\n`;
        });
        // Write the content to the freeze.env file in the specified directory
        fs.writeFileSync(freezeEnvFilePath, freezeEnvContent);
    }
    catch (error) {
        console.error(`Failed to update environment files: ${error.message}`);
    }
}
async function saveSession(adminWallet, allWallets, sessionDir, tokenName, timestamp, tokenAddress, poolKeys, currentSessionFileName) {
    console.log(chalk_1.default.blue(`Saving session to ${sessionDir}`));
    const sessionData = {
        admin: {
            number: adminWallet.number,
            address: adminWallet.publicKey,
            privateKey: adminWallet.privateKey,
        },
        wallets: allWallets.map(wallet => ({
            number: wallet.number,
            address: wallet.publicKey,
            privateKey: wallet.privateKey
        })),
        tokenAddress,
        poolKeys,
        tokenName,
        timestamp: formatTimestampToEST(new Date(timestamp))
    };
    const fileName = path.join(sessionDir, currentSessionFileName);
    const retries = 20;
    const delay = 500; // 1 second
    const success = await retrySaveSession(fileName, sessionData, retries, delay);
    if (success) {
        console.log(chalk_1.default.green('Session saved successfully.'));
        updateEnvFile(adminWallet, allWallets, tokenAddress);
    }
    else {
        console.log(chalk_1.default.red('Failed to save session after multiple attempts.'));
    }
    return success;
}
async function retryAppendWalletsToSession(sessionFilePath, sessionData, retries, delay) {
    for (let i = 0; i < retries; i++) {
        try {
            await fs.promises.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2));
            const savedData = JSON.parse(await fs.promises.readFile(sessionFilePath, 'utf-8'));
            if (JSON.stringify(savedData) === JSON.stringify(sessionData)) {
                return true;
            }
            throw new Error('Session verification failed');
        }
        catch (error) {
            console.log(chalk_1.default.red(`Failed to append wallets to session (attempt ${i + 1}): ${error.message}`));
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            else {
                return false;
            }
        }
    }
    return false;
}
async function appendWalletsToSession(newWallets, sessionFilePath) {
    console.log(chalk_1.default.blue(`Appending wallets to session file: ${sessionFilePath}`));
    try {
        const sessionData = JSON.parse(await fs.promises.readFile(sessionFilePath, 'utf-8'));
        const newWalletData = newWallets.map(wallet => ({
            number: wallet.number,
            address: wallet.publicKey,
            privateKey: wallet.privateKey,
            generationTimestamp: wallet.generationTimestamp || new Date().toISOString() // Handle optional generationTimestamp
        }));
        sessionData.wallets.push(...newWalletData);
        const retries = 20;
        const delay = 500; // 1 second
        const success = await retryAppendWalletsToSession(sessionFilePath, sessionData, retries, delay);
        if (success) {
            updateEnvFile(sessionData.admin, newWallets, sessionData.tokenAddress); // Update with new wallets
        }
        else {
            console.log(chalk_1.default.red('Failed to append wallets to session after multiple attempts.'));
        }
        return success;
    }
    catch (error) {
        console.log(chalk_1.default.red(`Failed to append wallets to session: ${error.message}`));
        return false;
    }
}
/**
 * Initializes a WalletWithNumber instance using an existing private key.
 * @param {string} privateKey - The private key in base58 format.
 * @param {number} number - The wallet number.
 * @returns {WalletWithNumber} - The initialized WalletWithNumber instance.
 */
function createWalletWithNumber(privateKey, number) {
    return wallet_1.default.fromPrivateKey(privateKey, number);
}
async function loadSession(sessionFile) {
    console.log(chalk_1.default.cyan(`Loading session from ${SESSION_DIR}`));
    try {
        const fileName = path.join(SESSION_DIR, sessionFile);
        const sessionData = JSON.parse(await fs.promises.readFile(fileName, 'utf-8'));
        const adminWallet = createWalletWithNumber(sessionData.admin.privateKey, sessionData.admin.number);
        const wallets = sessionData.wallets.map((wallet) => createWalletWithNumber(wallet.privateKey, wallet.number));
        console.log(chalk_1.default.cyan(`Admin Wallet Public Key: ${chalk_1.default.white(adminWallet.publicKey)}`));
        wallets.forEach(wallet => {
            console.log(chalk_1.default.cyan(`Wallet Public Key: ${chalk_1.default.white(wallet.publicKey)}`));
            updateEnvFile(adminWallet, wallets, sessionData.tokenAddress);
        });
        const timestamps = wallets.map(wallet => new Date(wallet.generationTimestamp).getTime());
        const latestGenerationTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
        const newWallets = latestGenerationTimestamp
            ? wallets.filter(wallet => new Date(wallet.generationTimestamp).getTime() === latestGenerationTimestamp)
            : wallets;
        console.log(chalk_1.default.green('Session loaded successfully'));
        updateEnvFile(adminWallet, newWallets, sessionData.tokenAddress);
        return {
            admin: {
                number: adminWallet.number,
                address: adminWallet.publicKey,
                privateKey: adminWallet.privateKey,
            },
            wallets: wallets.map(wallet => ({
                number: wallet.number,
                address: wallet.publicKey,
                privateKey: wallet.privateKey,
                generationTimestamp: wallet.generationTimestamp
            })),
            tokenAddress: sessionData.tokenAddress,
            poolKeys: sessionData.poolKeys,
            tokenName: sessionData.tokenName,
            timestamp: sessionData.timestamp
        };
    }
    catch (error) {
        console.log(chalk_1.default.red(`Failed to load session, starting a new session instead: ${error.message}`));
        return null;
    }
}
async function distributeSol(adminWallet, newWallets, totalAmount, connection) {
    console.log(chalk_1.default.yellow(`Distributing ${totalAmount.toFixed(6)} SOL to ${newWallets.length} wallets`));
    const amountPerWallet = totalAmount / newWallets.length;
    const successWallets = [];
    const distributeTasks = newWallets.map(async (wallet, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 700)); // 700ms delay
        try {
            const signature = await sendSol(adminWallet, new web3_js_1.PublicKey(wallet.publicKey), amountPerWallet, connection);
            console.log(chalk_1.default.yellow(`Distributed ${chalk_1.default.white(amountPerWallet.toFixed(6))} SOL to wallet ${chalk_1.default.gray(wallet.publicKey)}, tx hash: ${chalk_1.default.gray(signature)}`));
            successWallets.push(wallet);
        }
        catch (error) {
            console.log(chalk_1.default.red(`Failed to distribute SOL to wallet ${wallet.publicKey}`), error);
        }
    });
    await Promise.all(distributeTasks);
    return { successWallets };
}
async function getOrCreateAssociatedTokenAccount(connection, adminWallet, wallet, mint) {
    const keypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(wallet.privateKey));
    const adminKeypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(adminWallet.privateKey));
    const [associatedTokenAddress] = web3_js_1.PublicKey.findProgramAddressSync([
        keypair.publicKey.toBuffer(),
        spl_token_1.TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
    ], spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
    const tokenAccount = await connection.getAccountInfo(associatedTokenAddress);
    if (tokenAccount === null) {
        const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createAssociatedTokenAccountInstruction)(adminKeypair.publicKey, // payer (admin wallet)
        associatedTokenAddress, // associated token account address
        keypair.publicKey, // owner of the token account
        mint // token mint address
        ));
        // Set the fee payer to the admin wallet
        transaction.feePayer = adminKeypair.publicKey;
        // Fetch latest blockhash and set it in the transaction
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        try {
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [adminKeypair]);
            console.log(chalk_1.default.green(`Created associated token account for wallet ${wallet.publicKey} with address ${associatedTokenAddress.toBase58()} and mint ${mint.toBase58()}, tx hash: ${signature}`));
        }
        catch (error) {
            console.error(chalk_1.default.red(`Failed to create associated token account for wallet ${wallet.publicKey}, address ${associatedTokenAddress.toBase58()} and mint ${mint.toBase58()}`), error);
            throw error;
        }
    }
    else {
        console.log(chalk_1.default.blue(`Associated token account already exists for wallet ${wallet.publicKey} with address ${associatedTokenAddress.toBase58()} and mint ${mint.toBase58()}`));
    }
    return associatedTokenAddress;
}
async function distributeTokens(adminWallet, fromTokenAccountPubkey, wallets, mintPubkey, totalAmount, decimals, connection) {
    console.log(chalk_1.default.yellow(`Distributing ${totalAmount} tokens to ${wallets.length} wallets`));
    try {
        // Ensure the admin wallet's token account is valid
        const validatedFromTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(connection, adminWallet, adminWallet, mintPubkey);
        // Check if the admin wallet's token account has enough tokens
        const fromTokenBalance = await connection.getTokenAccountBalance(validatedFromTokenAccountPubkey);
        const fromTokenBalanceAmount = parseInt(fromTokenBalance.value.amount);
        const totalAmountRequired = totalAmount * Math.pow(10, decimals);
        if (fromTokenBalanceAmount < totalAmountRequired) {
            throw new Error(chalk_1.default.red(`Admin wallet token account does not have enough tokens. Required: ${chalk_1.default.white(totalAmount)}, Available: ${chalk_1.default.white(fromTokenBalance.value.uiAmount)}`));
        }
        const amountPerWallet = Math.floor(totalAmountRequired / wallets.length); // Convert to integer amount in smallest unit
        const distributeTasks = wallets.map(async (wallet, index) => {
            await new Promise(resolve => setTimeout(resolve, index * 700)); // 700ms delay
            try {
                // Log wallet before creating associated token account
                console.log(chalk_1.default.green(`Processing wallet ${wallet.publicKey}`));
                const toTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(connection, adminWallet, wallet, mintPubkey);
                // Log recipient wallet information after creating associated token account
                console.log(chalk_1.default.green(`Recipient wallet ${wallet.publicKey}, token account address: ${toTokenAccountPubkey.toBase58()}, mint: ${mintPubkey.toBase58()}`));
                const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createTransferCheckedInstruction)(validatedFromTokenAccountPubkey, // from (should be a token account)
                mintPubkey, // mint
                toTokenAccountPubkey, // to (should be a token account)
                new web3_js_1.PublicKey(adminWallet.publicKey), // from's owner
                BigInt(amountPerWallet), // amount, ensure amount is an integer
                decimals // decimals
                ));
                // Fetch latest blockhash and set it in the transaction
                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = new web3_js_1.PublicKey(adminWallet.publicKey);
                const keypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(adminWallet.privateKey));
                const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair]);
                console.log(chalk_1.default.cyan(`Transferred ${chalk_1.default.white(amountPerWallet / Math.pow(10, decimals))} tokens to ${chalk_1.default.blue(wallet.publicKey)} (token account: ${chalk_1.default.blue(toTokenAccountPubkey.toBase58())}), tx hash: ${chalk_1.default.green(signature)}`));
            }
            catch (error) {
                console.log(chalk_1.default.red(`Failed to distribute tokens to wallet ${wallet.publicKey}`), error);
                if (error.logs) {
                    console.log(chalk_1.default.red('Transaction logs:'), error.logs);
                }
            }
        });
        await Promise.all(distributeTasks);
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error in distributeTokens: ${error.message}`));
    }
}
//# sourceMappingURL=utility.js.map