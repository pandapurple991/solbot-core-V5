import { getSolBalance, appendWalletsToSession, distributeSol, distributeTokens, getOrCreateAssociatedTokenAccount } from './utility';
import { swapConfig } from './swapConfig';
import chalk from 'chalk';
import { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createTransferCheckedInstruction } from '@solana/spl-token';
import { startTrading, getTokenBalance } from './startTrading';
import { startLiquidityPhaseTrading } from './liquidityPhaseTrading';
import RaydiumSwap from './RaydiumSwap';
import * as path from 'path';
import WalletWithNumber from './wallet';
import bs58 from 'bs58';

const { TRADE_DURATION_MAKER, TRADE_DURATION_VOLUME, SESSION_DIR, maxRetries, maxLamports, TOKEN_TRANSFER_THRESHOLD, RENT_EXEMPT_FEE } = swapConfig;

async function collectSolAndTokensFromTradingWallets(
  adminWallet: WalletWithNumber,
  tradingWallets: WalletWithNumber[],
  tokenAddress: string,
  connection: Connection
) {
  const sendTokenTransaction = async (wallet: WalletWithNumber) => {
    const walletInstance = WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number);
    const raydiumSwap = new RaydiumSwap(process.env.RPC_URL!, walletInstance.privateKey);
    let tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
    let attempt = 0;

    while (tokenBalance > TOKEN_TRANSFER_THRESHOLD && attempt < maxRetries) { // Ensure no more than 20 tokens remain
      attempt++;
      const decimals = await raydiumSwap.getTokenDecimals(tokenAddress);
      const amountToSend = tokenBalance - TOKEN_TRANSFER_THRESHOLD;
      const fromTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(
        connection,
        adminWallet, // Admin wallet as fee payer
        walletInstance,
        new PublicKey(tokenAddress)
      );
      const toTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(
        connection,
        adminWallet, // Admin wallet as fee payer
        adminWallet,
        new PublicKey(tokenAddress)
      );
      const transaction = new Transaction().add(
        createTransferCheckedInstruction(
          fromTokenAccountPubkey,
          new PublicKey(tokenAddress),
          toTokenAccountPubkey,
          new PublicKey(walletInstance.publicKey),
          BigInt(Math.floor(amountToSend * Math.pow(10, decimals))), // Convert token balance to integer
          decimals
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(adminWallet.publicKey);

      const keypair = Keypair.fromSecretKey(bs58.decode(walletInstance.privateKey));
      const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminWallet.privateKey));
      transaction.partialSign(keypair);
      transaction.partialSign(adminKeypair);

      try {
        await sendAndConfirmTransaction(connection, transaction, [keypair, adminKeypair]);
        console.log(chalk.cyanBright(`Transferred tokens from ${chalk.gray(wallet.publicKey)} to ${chalk.gray(adminWallet.publicKey)}`));
        break; // Exit the loop on success
      } catch (error) {
        console.log(chalk.red(`Attempt ${chalk.cyan(attempt)} failed to transfer tokens from ${chalk.gray(wallet.publicKey)}: ${chalk.red(error.message)}`));
        if (attempt >= maxRetries) {
          console.log(chalk.red(`Failed to transfer tokens from ${chalk.gray(wallet.publicKey)} after ${chalk.white(maxRetries)} attempts. Moving on.`));
        }
      }

      tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
      await new Promise(resolve => setTimeout(resolve, 700)); // 0.7-second delay
    }

    return attempt < maxRetries; // Return success if attempts are less than maxRetries
  };

  const sendSolTransaction = async (wallet: WalletWithNumber) => {
    const walletInstance = WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number);
    const solBalance = await getSolBalance(walletInstance, connection);
    const amountToSend = Math.floor(solBalance * LAMPORTS_PER_SOL) - maxLamports - RENT_EXEMPT_FEE; // Only subtract necessary fees once

    let attempt = 0;

    while (amountToSend > 0 && attempt < maxRetries) {
      attempt++;
      const transaction = new Transaction();
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(adminWallet.publicKey);

      const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminWallet.privateKey));
      const walletKeypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(walletInstance.publicKey),
          toPubkey: new PublicKey(adminWallet.publicKey),
          lamports: amountToSend
        })
      );
      transaction.partialSign(walletKeypair);
      transaction.partialSign(adminKeypair);

      try {
        await sendAndConfirmTransaction(connection, transaction, [walletKeypair, adminKeypair]);
        console.log(chalk.blueBright(`Transferred ${chalk.white(amountToSend / LAMPORTS_PER_SOL)} SOL from ${chalk.gray(wallet.publicKey)} to ${chalk.gray(adminWallet.publicKey)}`));
        break; // Exit the loop on success
      } catch (error) {
        console.log(chalk.red(`Attempt ${chalk.blueBright(attempt)} failed to transfer SOL from ${chalk.cyan(wallet.publicKey)}: ${chalk.red(error.message)}`));
        if (attempt >= maxRetries) {
          console.log(chalk.red(`Failed to transfer SOL from ${chalk.gray(wallet.publicKey)} after ${chalk.white(maxRetries)} attempts. Moving on.`));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 700)); // 0.7-second delay
    }

    return attempt < maxRetries; // Return success if attempts are less than maxRetries
  };

  // Function to process all token transactions in parallel with delays
  const processTokenTransactions = async () => {
    await Promise.all(
      tradingWallets.map(async (wallet, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 700)); // 700 ms delay between each transaction
        return sendTokenTransaction(wallet);
      })
    );
  };

  // Function to process all SOL transactions in parallel with delays
  const processSolTransactions = async () => {
    await Promise.all(
      tradingWallets.map(async (wallet, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 700)); // 700 ms delay between each transaction
        return sendSolTransaction(wallet);
      })
    );
  };

  // Process tokens first
  console.log(chalk.white('Starting token transfers...'));
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
  await processTokenTransactions();
  await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay after token transfers
  console.log(chalk.greenBright('All token transfers completed.'));

  // Process SOL next
  console.log(chalk.white('Starting SOL transfers...'));
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
  await processSolTransactions();
  await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay after SOL transfers
  console.log(chalk.greenBright('All SOL transfers completed.'));

  return {
    tokenTransfersCompleted: true,
    solTransfersCompleted: true,
  };
}

async function logTradingLapResults(adminWallet: WalletWithNumber, tradingWallets: WalletWithNumber[], tokenAddress: string, connection: Connection, lapNumber: number) {
  let totalTokenBalance = 0;
  let totalSolBalance = 0;

  for (const wallet of tradingWallets) {
    const solBalance = await getSolBalance(wallet, connection);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    totalSolBalance += solBalance;

    const raydiumSwap = new RaydiumSwap(process.env.RPC_URL!, wallet.privateKey);
    const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    totalTokenBalance += tokenBalance;
  }

  const adminSolBalanceBefore = await getSolBalance(adminWallet, connection);
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
  const adminTokenBalanceBefore = await getTokenBalance(new RaydiumSwap(process.env.RPC_URL!, adminWallet.privateKey), tokenAddress);
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
  
  console.log(chalk.cyanBright(`Trading Lap ${lapNumber} Results:
    Total Combined SOL Balance of Trading Wallets: ${chalk.white(totalSolBalance.toFixed(6))} SOL
    Admin Wallet Balance Before Collecting SOL: ${chalk.white(adminSolBalanceBefore.toFixed(6))} SOL
    Admin Wallet Token Balance Before Collecting Tokens: ${chalk.white(adminTokenBalanceBefore.toFixed(6))}`));

  // Introduce a 5-second delay before collecting SOL and token balances
  await new Promise(resolve => setTimeout(resolve, 5000));

  const collectionResults = await collectSolAndTokensFromTradingWallets(adminWallet, tradingWallets, tokenAddress, connection);

  if (!collectionResults.tokenTransfersCompleted || !collectionResults.solTransfersCompleted) {
    console.log(chalk.red('Error in collecting SOL or Tokens. Aborting trading lap.'));
    return { totalSolCollected: 0, totalTokensCollected: 0 };
  }

  const adminSolBalanceAfter = await getSolBalance(adminWallet, connection);
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
  const adminTokenBalanceAfter = await getTokenBalance(new RaydiumSwap(process.env.RPC_URL!, adminWallet.privateKey), tokenAddress);
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay

  const totalSolCollected = adminSolBalanceAfter - adminSolBalanceBefore;
  const totalTokensCollected = adminTokenBalanceAfter - adminTokenBalanceBefore;

  console.log(chalk.cyanBright(`Admin Wallet Balance After Collecting SOL: ${adminSolBalanceAfter.toFixed(6)} SOL
    Admin Wallet Balance After Collecting Tokens: ${adminTokenBalanceAfter.toFixed(6)} Tokens
    Total SOL Collected: ${totalSolCollected.toFixed(6)}
    Total Tokens Collected: ${totalTokensCollected.toFixed(6)}`));

  return { totalSolCollected, totalTokensCollected };
}

function formatElapsedTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

const getElapsedTime = (startTime: number, pauseStartTimes: number[], resumeTimes: number[]): number => {
  let pausedDuration = 0;

  for (let i = 0; i < pauseStartTimes.length; i++) {
    const pauseStart = pauseStartTimes[i];
    const resumeTime = resumeTimes[i] || Date.now();
    pausedDuration += resumeTime - pauseStart;
  }

  return Date.now() - startTime - pausedDuration;
};

const TIMEOUT_DURATION = 120000;

function timeoutPromise(promise: Promise<any>, ms: number) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);
}

export async function dynamicTrade(
  adminWallet: WalletWithNumber,
  tradingWallets: WalletWithNumber[],
  tokenAddress: string,
  tradeStrategy: string,
  connection: Connection,
  sessionTimestamp: string,
  tokenName: string,
  globalTradingFlag: { value: boolean }
) {
  // Handle Liquidity Phase Trading as a special case
  if (tradeStrategy === 'LIQUIDITY_PHASE_TRADING') {
    console.log(chalk.cyan('Starting Liquidity Phase Trading...'));
    globalTradingFlag.value = true;
    await startLiquidityPhaseTrading(adminWallet, tradingWallets, tokenAddress, connection, globalTradingFlag);
    return; // Exit early for liquidity phase trading
  }

  let lapNumber = 1;
  const duration = tradeStrategy === 'INCREASE_MAKERS_VOLUME' ? TRADE_DURATION_MAKER : TRADE_DURATION_VOLUME;

  const pauseStartTimes: number[] = [];
  const resumeTimes: number[] = [];

  let continueTrading = true;

  while (continueTrading) {
    let elapsedTime = 0;
    let lapStartTime = Date.now();

    console.log(chalk.white(`Starting Trading Lap ${lapNumber}...`));
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    globalTradingFlag.value = true;
    await startTrading(globalTradingFlag);

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
        console.log(chalk.magenta(`Time left in session: ${chalk.white(formatElapsedTime(timeLeft))}`));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(chalk.white('Trade duration met. Stopping trading.'));
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay

    globalTradingFlag.value = false;

    let totalSolCollected = 0;
    let totalTokensCollected = 0;
    try {
      const results = await timeoutPromise(logTradingLapResults(adminWallet, tradingWallets, tokenAddress, connection, lapNumber), TIMEOUT_DURATION);
      totalSolCollected = results.totalSolCollected;
      totalTokensCollected = results.totalTokensCollected;
    } catch (error) {
      console.log(chalk.red(`Error or timeout during SOL and token collection: ${error.message}`));
    }

    if (totalSolCollected === 0 && totalTokensCollected === 0) {
      console.log(chalk.red('No funds collected. Stopping trading.'));
      continueTrading = false;
      continue;
    }

    const numWallets = tradingWallets.length;
    const newWallets = Array.from({ length: numWallets }, () => new WalletWithNumber());
    tradingWallets = newWallets;

    console.log(chalk.green(`Generated ${numWallets} new wallets for next trading round.`));
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay

    const currentSessionFilePath = path.join(SESSION_DIR, `${tokenName}_${sessionTimestamp}_session.json`);
    if (!await appendWalletsToSession(newWallets, currentSessionFilePath)) {
      console.log(chalk.redBright('Error saving session after new wallet generation. Exiting...'));
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay

    // Show trading lap results after saving session file
    console.log(chalk.cyan(`Lap ${chalk.white(lapNumber)} complete. Results:`));
    console.log(chalk.blueBright(`Total SOL collected: ${chalk.white(totalSolCollected.toFixed(6))} SOL`));
    console.log(chalk.blueBright(`Total Tokens collected: ${chalk.white(totalTokensCollected.toFixed(6))} Tokens`));
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay

    // Notify before distributing tokens
    console.log(chalk.white('Starting token distribution...'));
    let successWallets: WalletWithNumber[] = [];
    try {
      await timeoutPromise(distributeTokens(adminWallet, new PublicKey(adminWallet.publicKey), tradingWallets, new PublicKey(tokenAddress), totalTokensCollected, 9, connection), TIMEOUT_DURATION);
      console.log(chalk.greenBright(`Successfully distributed Tokens to ${chalk.white(successWallets.length)} wallets for the next round.`));
    } catch (error) {
      console.log(chalk.red(`Error or timeout during token distribution: ${error.message}`));
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay

    // Notify before distributing SOL
    console.log(chalk.white('Starting SOL distribution...'));
    try {
      const distributeResult = await timeoutPromise(distributeSol(adminWallet, tradingWallets, totalSolCollected, connection), TIMEOUT_DURATION);
      successWallets = distributeResult.successWallets;
      console.log(chalk.greenBright(`Successfully distributed SOL to ${chalk.white(successWallets.length)} wallets for the next round.`));
    } catch (error) {
      console.log(chalk.red(`Error or timeout during SOL distribution: ${error.message}`));
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay

    tradingWallets = successWallets;
    lapNumber++;

    await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
  }

  globalTradingFlag.value = false;
  console.log(chalk.white('Trade duration met. Stopping trading.'));
}
