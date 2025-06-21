import RaydiumSwap from './RaydiumSwap';
import { VersionedTransaction, Connection } from '@solana/web3.js';
import { swapConfig } from './swapConfig';
import chalk from 'chalk';
import { getPoolKeysForTokenAddress } from './pool-keys';
import WalletWithNumber from './wallet';

// Adapted from startTradingLiquidity2.ts for session-based integration
// This preserves the unique timed buy phase → timed sell phase pattern

let poolInfoCache: any = null;
let poolInfoReady = false;
let tokenName: string = '';
let tokenSymbol: string = '';
let tradingPaused = false;

const validateTokenAddress = async (tokenAddress: string) => {
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
  } catch (error) {
    console.error(`Error validating token: ${error.message}`);
    return false;
  }
};

const performSwap = async (raydiumSwap: RaydiumSwap, direction: 'buy' | 'sell', amount: number, walletNumber: number, tokenAddress: string) => {
  try {
    if (!poolInfoReady) {
      if (!poolInfoCache) {
        console.log(chalk.yellow(`Admin Is Initializing Swapping...`));
        console.log(chalk.magentaBright(`Admin Searching for Pool...`));

        let retries = 0;
        while (retries < swapConfig.poolSearchMaxRetries) {
          poolInfoCache = await getPoolKeysForTokenAddress(raydiumSwap.connection, tokenAddress);

          if (poolInfoCache) {
            console.log(chalk.green(`Admin Has Found Pool`));
            poolInfoReady = true;
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds before starting trading
            break;
          }

          retries++;
          console.log(chalk.yellow(`Pool not found, retrying... (${retries}/${swapConfig.poolSearchMaxRetries})`));
          await new Promise(resolve => setTimeout(resolve, swapConfig.poolSearchRetryInterval));
        }

        if (!poolInfoCache) {
          throw new Error('Pool info not found after maximum retries');
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for pool info to be ready
      }
    }

    const tx = await raydiumSwap.getSwapTransaction(
      direction === 'buy' ? tokenAddress : swapConfig.WSOL_ADDRESS,
      amount,
      poolInfoCache,
      swapConfig.maxLamports,
      direction === 'buy' ? 'in' : 'out'
    );

    const txid = await raydiumSwap.sendVersionedTransaction(tx as VersionedTransaction, swapConfig.maxRetries);
    return txid;
  } catch (error) {
    console.error(chalk.cyan(`Error performing swap for wallet ${walletNumber}: ${error.message}`));
    return null;
  }
};

const getTokenBalance = async (raydiumSwap: RaydiumSwap, mintAddress: string) => {
  try {
    const tokenAccounts = await raydiumSwap.getOwnerTokenAccounts();
    const tokenAccount = tokenAccounts.find(acc => acc.accountInfo.mint.toString() === mintAddress);
    if (!tokenAccount) return 0;

    const decimals = await raydiumSwap.getTokenDecimals(mintAddress);
    return Number(tokenAccount.accountInfo.amount) / Math.pow(10, decimals);
  } catch (error) {
    return 0;
  }
};

const getRandomAmount = (minPercentage: number, maxPercentage: number, baseAmount: number) => {
  const minAmount = baseAmount * (minPercentage / 100);
  const maxAmount = baseAmount * (maxPercentage / 100);
  return minAmount + Math.random() * (maxAmount - minAmount);
};

const getRandomSellAmount = (minSellPercentage: number, maxSellPercentage: number, baseAmount: number) => {
  const minAmount = baseAmount * (minSellPercentage / 100);
  const maxAmount = baseAmount * (maxSellPercentage / 100);
  return minAmount + Math.random() * (maxAmount - minAmount);
};

const liquidityPhaseSwapLoop = async (
  wallet: WalletWithNumber, 
  walletNumber: number, 
  tokenAddress: string,
  connection: Connection,
  globalTradingFlag: { value: boolean }
) => {
  try {
    const raydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, wallet.privateKey);

    console.log(chalk.cyan(`Wallet ${walletNumber} - Liquidity Phase Trading is about to begin...`));

    while (globalTradingFlag.value) {
      const startTime = Date.now();

      // Buy Phase - Continuous buying for buyDuration
      console.log(chalk.blueBright(`Wallet ${walletNumber} - Starting BUY PHASE (${swapConfig.buyDuration/1000}s)`));
      while (globalTradingFlag.value && Date.now() - startTime < swapConfig.buyDuration) {
        if (tradingPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const solBalance = await raydiumSwap.getBalance();
        const buyAmount = getRandomAmount(swapConfig.minPercentage, swapConfig.maxPercentage, solBalance - swapConfig.RENT_EXEMPT_FEE);
        const buyTxHash = await performSwap(raydiumSwap, 'buy', buyAmount, walletNumber, tokenAddress);

        if (buyTxHash) {
          const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
          console.log(chalk.green(`Wallet ${chalk.cyan(walletNumber)} Buy ${chalk.yellow(buyAmount.toFixed(6))} SOL - Balance ${chalk.yellow(tokenBalance.toFixed(6))} ${chalk.yellow(tokenSymbol)}`));
          console.log(chalk.green(`Successful Buy https://solscan.io/tx/${buyTxHash}`));
        }

        await new Promise(resolve => setTimeout(resolve, swapConfig.loopInterval / 2));

        // Second buy in same loop iteration
        if (globalTradingFlag.value && Date.now() - startTime < swapConfig.buyDuration) {
          const solBalanceSecond = await raydiumSwap.getBalance();
          const buyAmountSecond = getRandomAmount(swapConfig.minPercentage, swapConfig.maxPercentage, solBalanceSecond - swapConfig.RENT_EXEMPT_FEE);
          const buyTxHashSecond = await performSwap(raydiumSwap, 'buy', buyAmountSecond, walletNumber, tokenAddress);

          if (buyTxHashSecond) {
            const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
            console.log(chalk.green(`Wallet ${chalk.cyan(walletNumber)} Buy ${chalk.yellow(buyAmountSecond.toFixed(6))} SOL - Balance ${chalk.yellow(tokenBalanceSecond.toFixed(6))} ${chalk.yellow(tokenSymbol)}`));
            console.log(chalk.green(`Successful Buy https://solscan.io/tx/${buyTxHashSecond}`));
          }
        }
      }

      if (!globalTradingFlag.value) break;

      // Sell Phase - Continuous selling for sellDuration
      console.log(chalk.magentaBright(`Wallet ${walletNumber} - Starting SELL PHASE (${swapConfig.sellDuration/1000}s)`));
      const sellStartTime = Date.now();
      while (globalTradingFlag.value && Date.now() - sellStartTime < swapConfig.sellDuration) {
        if (tradingPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
        if (tokenBalance > 0) {
          const sellAmount = getRandomSellAmount(swapConfig.minSellPercentage, swapConfig.maxSellPercentage, tokenBalance);
          const sellTxHash = await performSwap(raydiumSwap, 'sell', sellAmount, walletNumber, tokenAddress);
          if (sellTxHash) {
            const solBalance = await raydiumSwap.getBalance();
            console.log(chalk.red(`Wallet ${chalk.cyan(walletNumber)} Sell ${chalk.yellow(sellAmount.toFixed(6))} ${chalk.yellow(tokenSymbol)} - Balance ${chalk.yellow(solBalance.toFixed(6))} SOL`));
            console.log(chalk.red(`Successful Sell https://solscan.io/tx/${sellTxHash}`));
          }

          await new Promise(resolve => setTimeout(resolve, swapConfig.loopInterval / 2));

          // Second sell in same loop iteration
          if (globalTradingFlag.value && Date.now() - sellStartTime < swapConfig.sellDuration) {
            const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
            if (tokenBalanceSecond > 0) {
              const sellAmountSecond = getRandomSellAmount(swapConfig.minSellPercentage, swapConfig.maxSellPercentage, tokenBalanceSecond);
              const sellTxHashSecond = await performSwap(raydiumSwap, 'sell', sellAmountSecond, walletNumber, tokenAddress);
              if (sellTxHashSecond) {
                const solBalanceSecond = await raydiumSwap.getBalance();
                console.log(chalk.red(`Wallet ${chalk.cyan(walletNumber)} Sell ${chalk.yellow(sellAmountSecond.toFixed(6))} ${chalk.yellow(tokenSymbol)} - Balance ${chalk.yellow(solBalanceSecond.toFixed(6))} SOL`));
                console.log(chalk.red(`Successful Sell https://solscan.io/tx/${sellTxHashSecond}`));
              }
            }
          }
        }
      }

      // Brief pause between cycles
      console.log(chalk.white(`Wallet ${walletNumber} - Cycle complete, brief pause before next cycle...`));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error(chalk.redBright(`Error in liquidity phase swap loop for wallet ${walletNumber}: ${error.message}`));
  }
};

// Main function for Liquidity Phase Trading
export const startLiquidityPhaseTrading = async (
  adminWallet: WalletWithNumber,
  tradingWallets: WalletWithNumber[],
  tokenAddress: string,
  connection: Connection,
  globalTradingFlag: { value: boolean }
) => {
  try {
    // Validate token address and get token info
    const isValidToken = await validateTokenAddress(tokenAddress);
    if (!isValidToken) {
      console.error(chalk.red('Invalid token address for liquidity phase trading.'));
      return false;
    }

    console.log(chalk.cyan(`Liquidity Phase Trading - Token: ${tokenName} (${tokenSymbol})`));
    console.log(chalk.blueBright(`Buy Phase Duration: ${swapConfig.buyDuration/1000}s | Sell Phase Duration: ${swapConfig.sellDuration/1000}s`));

    // Initialize pool with admin wallet
    const adminRaydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, adminWallet.privateKey);
    await performSwap(adminRaydiumSwap, 'buy', swapConfig.initialAmount, 0, tokenAddress); // Fetch the pool ID

    // Start liquidity phase trading for all wallets
    const tradingPromises = tradingWallets.map((wallet, index) => 
      liquidityPhaseSwapLoop(wallet, index + 1, tokenAddress, connection, globalTradingFlag)
    );

    await Promise.all(tradingPromises);
    
    console.log(chalk.green('Liquidity Phase Trading completed for all wallets'));
    return true;
  } catch (error) {
    console.error(chalk.red(`Error in Liquidity Phase Trading: ${error.message}`));
    return false;
  }
};

// Export for integration
export { liquidityPhaseSwapLoop, getTokenBalance };