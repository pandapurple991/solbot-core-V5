import RaydiumSwap from './RaydiumSwap';
import { VersionedTransaction } from '@solana/web3.js';
import 'dotenv/config';
import { swapConfig } from './swapConfig';
import chalk from 'chalk';
import fetch from 'node-fetch';
import readline from 'readline';
import keypress from 'keypress';
import { getPoolKeysForTokenAddress } from './pool-keys';

// Function to get all wallet keys from the .env file
const getAllWalletKeys = (): string[] => {
  const walletKeys: string[] = [];
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

let poolInfoCache: any = null;
let poolInfoReady = false;
let tokenName: string = '';
let tokenSymbol: string = '';
let tradingPaused = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const prompt = (query: string) => {
  return new Promise<string>((resolve) => rl.question(query, resolve));
};

const validateTokenAddress = async (tokenAddress: string) => {
  const response = await fetch(`https://api.dexscreener.io/latest/dex/tokens/${tokenAddress}`);
  const data = await response.json();

  if (data.pairs && data.pairs.length > 0) {
    const { baseToken } = data.pairs[0];
    tokenName = baseToken.name;
    tokenSymbol = baseToken.symbol;
    return true;
  }

  return false;
};

const performSwap = async (raydiumSwap: RaydiumSwap, direction: 'buy' | 'sell', amount: number, walletNumber: number) => {
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

export const getTokenBalance = async (raydiumSwap: RaydiumSwap, mintAddress: string) => {
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

export const swapLoop = async (walletNumber: number, globalTradingFlag: { value: boolean }) => {
  try {
    const raydiumSwap = new RaydiumSwap(process.env.RPC_URL!, walletKeys[walletNumber - 1]!);

    console.log(chalk.cyan(`Wallet ${walletNumber} - Trading is about to begin...`));

    while (globalTradingFlag.value) {
      const startTime = Date.now();

      // Buy Phase
      while (globalTradingFlag.value && Date.now() - startTime < swapConfig.buyDuration) {
        if (tradingPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const solBalance = await raydiumSwap.getBalance();
        const buyAmount = getRandomAmount(swapConfig.minPercentage, swapConfig.maxPercentage, solBalance - swapConfig.RENT_EXEMPT_SWAP_FEE);
        const buyTxHash = await performSwap(raydiumSwap, 'buy', buyAmount, walletNumber);

        if (buyTxHash) {
          const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
          console.log(chalk.green(`Wallet ${chalk.cyan(walletNumber)} Buy ${chalk.yellow(buyAmount.toFixed(6))} SOL - Balance ${chalk.yellow(tokenBalance.toFixed(6))} ${chalk.yellow(tokenSymbol)}`));
          console.log(chalk.green(`Successful Buy https://solscan.io/tx/${buyTxHash}`));
        }

        await new Promise(resolve => setTimeout(resolve, swapConfig.loopInterval / 2));

        const solBalanceSecond = await raydiumSwap.getBalance();
        const buyAmountSecond = getRandomAmount(swapConfig.minPercentage, swapConfig.maxPercentage, solBalanceSecond - swapConfig.RENT_EXEMPT_SWAP_FEE);
        const buyTxHashSecond = await performSwap(raydiumSwap, 'buy', buyAmountSecond, walletNumber);

        if (buyTxHashSecond) {
          const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
          console.log(chalk.green(`Wallet ${chalk.cyan(walletNumber)} Buy ${chalk.yellow(buyAmountSecond.toFixed(6))} SOL - Balance ${chalk.yellow(tokenBalanceSecond.toFixed(6))} ${chalk.yellow(tokenSymbol)}`));
          console.log(chalk.green(`Successful Buy https://solscan.io/tx/${buyTxHashSecond}`));
        }
      }

      // Sell Phase
      const sellStartTime = Date.now();
      while (globalTradingFlag.value && Date.now() - sellStartTime < swapConfig.sellDuration) {
        if (tradingPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);
        if (tokenBalance > 0) {
          const sellAmount = getRandomSellAmount(swapConfig.minSellPercentage, swapConfig.maxSellPercentage, tokenBalance);
          const sellTxHash = await performSwap(raydiumSwap, 'sell', sellAmount, walletNumber);
          if (sellTxHash) {
            const solBalance = await raydiumSwap.getBalance();
            console.log(chalk.red(`Wallet ${chalk.cyan(walletNumber)} Sell ${chalk.yellow(sellAmount.toFixed(6))} ${chalk.yellow(tokenSymbol)} - Balance ${chalk.yellow(solBalance.toFixed(6))} SOL`));
            console.log(chalk.red(`Successful Sell https://solscan.io/tx/${sellTxHash}`));
          }

          await new Promise(resolve => setTimeout(resolve, swapConfig.loopInterval / 2));

          const tokenBalanceSecond = await getTokenBalance(raydiumSwap, tokenAddress);
          if (tokenBalanceSecond > 0) {
            const sellAmountSecond = getRandomSellAmount(swapConfig.minSellPercentage, swapConfig.maxSellPercentage, tokenBalanceSecond);
            const sellTxHashSecond = await performSwap(raydiumSwap, 'sell', sellAmountSecond, walletNumber);
            if (sellTxHashSecond) {
              const solBalanceSecond = await raydiumSwap.getBalance();
              console.log(chalk.red(`Wallet ${chalk.cyan(walletNumber)} Sell ${chalk.yellow(sellAmountSecond.toFixed(6))} ${chalk.yellow(tokenSymbol)} - Balance ${chalk.yellow(solBalanceSecond.toFixed(6))} SOL`));
              console.log(chalk.red(`Successful Sell https://solscan.io/tx/${sellTxHashSecond}`));
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(chalk.redBright(`Error in swap loop for wallet ${walletNumber}: ${error.message}`));
  }
};

const sellAllTokens = async () => {
  console.log('Selling all tokens...');

  for (let index = 0; index < walletKeys.length; index++) {
    const key = walletKeys[index];
    const walletNumber = index + 1;
    const raydiumSwap = new RaydiumSwap(process.env.RPC_URL!, key!);

    console.log(`Wallet ${walletNumber} - Checking token balance...`);
    let tokenBalance = await getTokenBalance(raydiumSwap, tokenAddress);

    while (tokenBalance >= 5) {
      console.log(chalk.yellow(`Wallet ${walletNumber} - Found token balance: ${tokenBalance.toFixed(2)} ${tokenSymbol}`));
      console.log(`Wallet ${walletNumber} - Selling ${tokenBalance.toFixed(2)} ${tokenSymbol}...`);

      let sellTxHash;
      for (let attempt = 1; attempt <= swapConfig.maxRetries; attempt++) {
        try {
          sellTxHash = await performSwap(raydiumSwap, 'sell', tokenBalance, walletNumber);
          if (sellTxHash) {
            break;
          }
        } catch (error) {
          if (error.response?.status === 429) {
            console.error(`Wallet ${walletNumber} - Server responded with 429 Too Many Requests. Retrying after ${swapConfig.retryInterval / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, swapConfig.retryInterval));
          } else {
            console.error(`Wallet ${walletNumber} - Sell attempt ${attempt} failed: ${error.message}.`);
            if (attempt < swapConfig.maxRetries) {
              console.error(`Retrying in ${swapConfig.retryInterval / 1000} seconds...`);
              await new Promise(resolve => setTimeout(resolve, swapConfig.retryInterval));
            } else {
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
      console.log(chalk.red('Invalid option. Please try again.'));
      await handleUserOptions();
  }
};

const listenForPauseCommand = () => {
  keypress(process.stdin);

  process.stdin.on('keypress', async (ch, key) => {
    if (key && key.ctrl && key.name === 's') {
      console.log(chalk.yellow('Pausing trading...'));
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

export const startTrading = async (globalTradingFlag: { value: boolean }) => {
  const isValidToken = await validateTokenAddress(tokenAddress);

  if (!isValidToken) {
    console.error(chalk.red('Invalid token address. Please check the configuration.'));
    process.exit(1);
  }

  console.log(chalk.cyan(`Token: ${tokenName} (${tokenSymbol})`));

  const adminRaydiumSwap = new RaydiumSwap(process.env.RPC_URL!, adminWalletKey);
  await performSwap(adminRaydiumSwap, 'buy', swapConfig.initialAmount, 0); // Fetch the pool ID

  for (let i = 1; i <= walletKeys.length; i++) {
    swapLoop(i, globalTradingFlag);
  }

  listenForPauseCommand();
};
