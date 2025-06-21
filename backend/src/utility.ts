import {
  Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import * as fs from 'fs';
import * as path from 'path';
import { swapConfig } from './swapConfig';
import chalk from 'chalk';
import WalletWithNumber from './wallet';
import bs58 from 'bs58';

const { SESSION_DIR } = swapConfig;

export function formatTimestampToEST(date: Date): string {
  const timeZone = 'America/New_York';
  const zonedDate = toZonedTime(date, timeZone);
  return format(zonedDate, 'MM.dd.yyyy_hh.mm.ssaaa');
}

export async function getSolBalance(wallet: WalletWithNumber, connection: Connection): Promise<number> {
  const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
  const balance = await connection.getBalance(keypair.publicKey);
  return balance / 1e9; // Convert lamports to SOL
}

export async function sendSol(fromWallet: WalletWithNumber, toPublicKey: PublicKey, amountSol: number, connection: Connection) {
  const fromKeypair = Keypair.fromSecretKey(bs58.decode(fromWallet.privateKey));
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL); // Ensure amount is an integer

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports: lamports,
    })
  );

  // Fetch latest blockhash and set it in the transaction
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromKeypair.publicKey;

  const signature = await sendAndConfirmTransaction(connection, transaction, [fromKeypair]);
  console.log(chalk.yellow(`Sent ${chalk.white(amountSol)} SOL from ${chalk.gray(fromKeypair.publicKey.toBase58())} to ${chalk.gray(toPublicKey.toBase58())}, tx hash: ${chalk.gray(signature)}`));
  return signature;
}

async function retrySaveSession(fileName: string, sessionData: object, retries: number, delay: number): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.writeFile(fileName, JSON.stringify(sessionData, null, 2));
      const savedData = JSON.parse(await fs.promises.readFile(fileName, 'utf-8'));
      if (JSON.stringify(savedData) === JSON.stringify(sessionData)) {
        return true;
      }
      throw new Error('Session verification failed');
    } catch (error) {
      console.log(chalk.red(`Failed to save session (attempt ${i + 1}): ${error.message}`));
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return false;
      }
    }
  }
  return false;
}

function updateEnvFile(adminWallet: WalletWithNumber, newWallets: WalletWithNumber[], tokenAddress: string) {
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

  } catch (error) {
    console.error(`Failed to update environment files: ${error.message}`);
  }
}

export async function saveSession(
  adminWallet: WalletWithNumber,
  allWallets: WalletWithNumber[],
  sessionDir: string,
  tokenName: string,
  timestamp: string,
  tokenAddress: string,
  poolKeys: any,
  currentSessionFileName: string
): Promise<boolean> {
  console.log(chalk.blue(`Saving session to ${sessionDir}`));

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
    console.log(chalk.green('Session saved successfully.'));
    updateEnvFile(adminWallet, allWallets, tokenAddress);
  } else {
    console.log(chalk.red('Failed to save session after multiple attempts.'));
  }
  return success;
}

async function retryAppendWalletsToSession(sessionFilePath: string, sessionData: object, retries: number, delay: number): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2));
      const savedData = JSON.parse(await fs.promises.readFile(sessionFilePath, 'utf-8'));
      if (JSON.stringify(savedData) === JSON.stringify(sessionData)) {
        return true;
      }
      throw new Error('Session verification failed');
    } catch (error) {
      console.log(chalk.red(`Failed to append wallets to session (attempt ${i + 1}): ${error.message}`));
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return false;
      }
    }
  }
  return false;
}

export async function appendWalletsToSession(
  newWallets: WalletWithNumber[],
  sessionFilePath: string
): Promise<boolean> {
  console.log(chalk.blue(`Appending wallets to session file: ${sessionFilePath}`));

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
    } else {
      console.log(chalk.red('Failed to append wallets to session after multiple attempts.'));
    }
    return success;
  } catch (error) {
    console.log(chalk.red(`Failed to append wallets to session: ${error.message}`));
    return false;
  }
}

export interface SessionData {
  admin: {
    number: number;
    address: string;
    privateKey: string;
  };
  wallets: Array<{
    number: number;
    address: string;
    privateKey: string;
    generationTimestamp?: string; // Add generationTimestamp to the interface
  }>;
  tokenAddress: string;
  poolKeys: any;
  tokenName: string;
  timestamp: string;
}
/**
 * Initializes a WalletWithNumber instance using an existing private key.
 * @param {string} privateKey - The private key in base58 format.
 * @param {number} number - The wallet number.
 * @returns {WalletWithNumber} - The initialized WalletWithNumber instance.
 */
export function createWalletWithNumber(privateKey: string, number: number): WalletWithNumber {
  return WalletWithNumber.fromPrivateKey(privateKey, number);
}

export async function loadSession(sessionFile: string): Promise<SessionData | null> {
  console.log(chalk.cyan(`Loading session from ${SESSION_DIR}`));
  try {
    const fileName = path.join(SESSION_DIR, sessionFile);
    const sessionData = JSON.parse(await fs.promises.readFile(fileName, 'utf-8'));

    const adminWallet = createWalletWithNumber(sessionData.admin.privateKey, sessionData.admin.number);

    const wallets = sessionData.wallets.map((wallet: any) =>
      createWalletWithNumber(wallet.privateKey, wallet.number)
    );

    console.log(chalk.cyan(`Admin Wallet Public Key: ${chalk.white(adminWallet.publicKey)}`));
    wallets.forEach(wallet => {
      console.log(chalk.cyan(`Wallet Public Key: ${chalk.white(wallet.publicKey)}`));

      updateEnvFile(adminWallet, wallets, sessionData.tokenAddress);

    });

    const timestamps = wallets.map(wallet => new Date(wallet.generationTimestamp).getTime());
    const latestGenerationTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;

    const newWallets = latestGenerationTimestamp
      ? wallets.filter(wallet => new Date(wallet.generationTimestamp).getTime() === latestGenerationTimestamp)
      : wallets;

    console.log(chalk.green('Session loaded successfully'));
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
  } catch (error) {
    console.log(chalk.red(`Failed to load session, starting a new session instead: ${error.message}`));
    return null;
  }
}

export async function distributeSol(adminWallet: WalletWithNumber, newWallets: WalletWithNumber[], totalAmount: number, connection: Connection) {
  console.log(chalk.yellow(`Distributing ${totalAmount.toFixed(6)} SOL to ${newWallets.length} wallets`));
  const amountPerWallet = totalAmount / newWallets.length;
  const successWallets: WalletWithNumber[] = [];

  const distributeTasks = newWallets.map(async (wallet, index) => {
    await new Promise(resolve => setTimeout(resolve, index * 700)); // 700ms delay
    try {
      const signature = await sendSol(adminWallet, new PublicKey(wallet.publicKey), amountPerWallet, connection);
      console.log(chalk.yellow(`Distributed ${chalk.white(amountPerWallet.toFixed(6))} SOL to wallet ${chalk.gray(wallet.publicKey)}, tx hash: ${chalk.gray(signature)}`));
      successWallets.push(wallet);
    } catch (error) {
      console.log(chalk.red(`Failed to distribute SOL to wallet ${wallet.publicKey}`), error);
    }
  });

  await Promise.all(distributeTasks);

  return { successWallets };
}

export async function getOrCreateAssociatedTokenAccount(
  connection: Connection,
  adminWallet: WalletWithNumber,
  wallet: WalletWithNumber,
  mint: PublicKey
): Promise<PublicKey> {
  const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminWallet.privateKey));
  const [associatedTokenAddress] = PublicKey.findProgramAddressSync(
    [
      keypair.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const tokenAccount = await connection.getAccountInfo(associatedTokenAddress);

  if (tokenAccount === null) {
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        adminKeypair.publicKey, // payer (admin wallet)
        associatedTokenAddress, // associated token account address
        keypair.publicKey, // owner of the token account
        mint // token mint address
      )
    );

    // Set the fee payer to the admin wallet
    transaction.feePayer = adminKeypair.publicKey;

    // Fetch latest blockhash and set it in the transaction
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    try {
      const signature = await sendAndConfirmTransaction(connection, transaction, [adminKeypair]);
      console.log(chalk.green(`Created associated token account for wallet ${wallet.publicKey} with address ${associatedTokenAddress.toBase58()} and mint ${mint.toBase58()}, tx hash: ${signature}`));
    } catch (error) {
      console.error(chalk.red(`Failed to create associated token account for wallet ${wallet.publicKey}, address ${associatedTokenAddress.toBase58()} and mint ${mint.toBase58()}`), error);
      throw error;
    }
  } else {
    console.log(chalk.blue(`Associated token account already exists for wallet ${wallet.publicKey} with address ${associatedTokenAddress.toBase58()} and mint ${mint.toBase58()}`));
  }
  return associatedTokenAddress;
}

export async function distributeTokens(
  adminWallet: WalletWithNumber,
  fromTokenAccountPubkey: PublicKey,
  wallets: WalletWithNumber[],
  mintPubkey: PublicKey,
  totalAmount: number,
  decimals: number,
  connection: Connection
) {
  console.log(chalk.yellow(`Distributing ${totalAmount} tokens to ${wallets.length} wallets`));

  try {
    // Ensure the admin wallet's token account is valid
    const validatedFromTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(connection, adminWallet, adminWallet, mintPubkey);

    // Check if the admin wallet's token account has enough tokens
    const fromTokenBalance = await connection.getTokenAccountBalance(validatedFromTokenAccountPubkey);
    const fromTokenBalanceAmount = parseInt(fromTokenBalance.value.amount);
    const totalAmountRequired = totalAmount * Math.pow(10, decimals);

    if (fromTokenBalanceAmount < totalAmountRequired) {
      throw new Error(chalk.red(`Admin wallet token account does not have enough tokens. Required: ${chalk.white(totalAmount)}, Available: ${chalk.white(fromTokenBalance.value.uiAmount)}`));
    }

    const amountPerWallet = Math.floor(totalAmountRequired / wallets.length); // Convert to integer amount in smallest unit

    const distributeTasks = wallets.map(async (wallet, index) => {
      await new Promise(resolve => setTimeout(resolve, index * 700)); // 700ms delay
      try {
        // Log wallet before creating associated token account
        console.log(chalk.green(`Processing wallet ${wallet.publicKey}`));

        const toTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(connection, adminWallet, wallet, mintPubkey);

        // Log recipient wallet information after creating associated token account
        console.log(chalk.green(`Recipient wallet ${wallet.publicKey}, token account address: ${toTokenAccountPubkey.toBase58()}, mint: ${mintPubkey.toBase58()}`));

        const transaction = new Transaction().add(
          createTransferCheckedInstruction(
            validatedFromTokenAccountPubkey, // from (should be a token account)
            mintPubkey, // mint
            toTokenAccountPubkey, // to (should be a token account)
            new PublicKey(adminWallet.publicKey), // from's owner
            BigInt(amountPerWallet), // amount, ensure amount is an integer
            decimals // decimals
          )
        );

        // Fetch latest blockhash and set it in the transaction
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = new PublicKey(adminWallet.publicKey);

        const keypair = Keypair.fromSecretKey(bs58.decode(adminWallet.privateKey));

        const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
        console.log(chalk.cyan(`Transferred ${chalk.white(amountPerWallet / Math.pow(10, decimals))} tokens to ${chalk.blue(wallet.publicKey)} (token account: ${chalk.blue(toTokenAccountPubkey.toBase58())}), tx hash: ${chalk.green(signature)}`));
      } catch (error) {
        console.log(chalk.red(`Failed to distribute tokens to wallet ${wallet.publicKey}`), error);
        if (error.logs) {
          console.log(chalk.red('Transaction logs:'), error.logs);
        }
      }
    });

    await Promise.all(distributeTasks);
  } catch (error) {
    console.error(chalk.red(`Error in distributeTokens: ${error.message}`));
  }
}
