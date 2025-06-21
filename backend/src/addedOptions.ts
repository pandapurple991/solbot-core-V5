import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { burnChecked, closeAccount } from '@solana/spl-token';
import chalk from 'chalk';
import bs58 from 'bs58';
import WalletWithNumber from './wallet';
import { getTokenBalance } from './startTrading';
import { getSolBalance, getOrCreateAssociatedTokenAccount } from './utility';
import { swapConfig } from './swapConfig';
import RaydiumSwap from './RaydiumSwap';

const { maxRetries, retryInterval } = swapConfig;

async function retryOperation(operation: () => Promise<any>, retries: number, interval: number): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(chalk.red(`Attempt ${attempt} failed: ${error.message}`));
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, interval));
      } else {
        throw new Error(`Operation failed after ${retries} attempts: ${error.message}`);
      }
    }
  }
}
export async function closeTokenAccountsAndSendBalance(
  adminWallet: WalletWithNumber,
  tradingWallets: WalletWithNumber[],
  tokenAddress: string,
  connection: Connection
) {
  console.log(chalk.blueBright('Starting the process to close token accounts and send balance to admin wallet...'));

  for (let i = 0; i < tradingWallets.length; i++) {
    const wallet = tradingWallets[i];
    const walletNumber = i + 1;
    const walletKeypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminWallet.privateKey));

    console.log(chalk.magentaBright(`Processing wallet #${chalk.cyan(walletNumber)}: ${chalk.blue(wallet.publicKey)}`));

    try {
      const raydiumSwap = new RaydiumSwap(process.env.RPC_URL!, wallet.privateKey);
      const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);

      if (tokenBalance > 0) {
        const decimals = await raydiumSwap.getTokenDecimals(tokenAddress);
        console.log(chalk.yellow(`Burning ${chalk.white(tokenBalance)} tokens from wallet ${chalk.blue(wallet.publicKey)}`));

        // Burn the tokens
        await retryOperation(async () => {
          const burnTxHash = await burnChecked(
            connection,
            adminKeypair, // fee payer
            await getOrCreateAssociatedTokenAccount(connection, adminWallet, wallet, new PublicKey(tokenAddress)), // token account
            new PublicKey(tokenAddress), // mint
            walletKeypair, // owner
            BigInt(tokenBalance * Math.pow(10, decimals)), // amount
            decimals // decimals
          );
          console.log(chalk.green(`Burned ${chalk.white(tokenBalance)} tokens from wallet ${chalk.blue(wallet.publicKey)}. Transaction hash: ${chalk.white(burnTxHash)}`));
        }, maxRetries, retryInterval);
        
        // Close the token account
        await retryOperation(async () => {
          const closeTxHash = await closeAccount(
            connection,
            adminKeypair, // fee payer
            await getOrCreateAssociatedTokenAccount(connection, adminWallet, wallet, new PublicKey(tokenAddress)), // token account
            new PublicKey(adminWallet.publicKey), // destination (admin wallet)
            walletKeypair // owner of token account
          );
          console.log(chalk.green(`Closed token account for wallet ${chalk.blue(wallet.publicKey)}. Transaction hash: ${chalk.white(closeTxHash)}`));
        }, maxRetries, retryInterval);
      } else {
        console.log(chalk.yellow(`No tokens to burn for wallet ${chalk.blue(wallet.publicKey)}`));
      }

      // Send SOL balance to admin wallet
      const solBalance = await getSolBalance(wallet, connection);
      if (solBalance > 0) {
        const lamportsToSend = Math.floor(solBalance * LAMPORTS_PER_SOL);

        await retryOperation(async () => {
          const transferTransaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: walletKeypair.publicKey,
              toPubkey: adminKeypair.publicKey,
              lamports: lamportsToSend,
            })
          );

          const transferTxHash = await sendAndConfirmTransaction(connection, transferTransaction, [walletKeypair, adminKeypair]);
          console.log(chalk.green(`Transferred ${chalk.white(solBalance)} SOL from wallet ${chalk.blue(wallet.publicKey)} to admin wallet. Transaction hash: ${chalk.white(transferTxHash)}`));
        }, maxRetries, retryInterval);
      } else {
        console.log(chalk.yellow(`No SOL to transfer for wallet ${chalk.blue(wallet.publicKey)}`));
      }

    } catch (error) {
      console.log(chalk.red(`Error processing wallet ${chalk.blue(wallet.publicKey)}: ${chalk.white(error.message)}`));
    }
  }

  console.log(chalk.blueBright('Completed the process of closing token accounts and sending balances to admin wallet.'));
}
