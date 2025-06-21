import * as fs from 'fs';
import * as path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import chalk from 'chalk';
import promptSync from 'prompt-sync';
import { closeTokenAccountsAndSendBalance } from './addedOptions';
import { getPoolKeysForTokenAddress, getMarketIdForTokenAddress } from './pool-keys';
import { swapConfig } from './swapConfig';
import RaydiumSwap from './RaydiumSwap';
import {
  formatTimestampToEST,
  distributeSol,
  loadSession,
  getSolBalance,
  distributeTokens,
  saveSession,
  appendWalletsToSession,
  createWalletWithNumber
} from './utility';
import { dynamicTrade } from './dynamicTrade';
import axios from 'axios';
import { getTokenBalance } from './startTrading';
import WalletWithNumber from './wallet';

const prompt = promptSync();
const { SESSION_DIR, RPC_URL } = swapConfig;

let connection: Connection;
let raydiumSwap: RaydiumSwap;
let adminWallet: WalletWithNumber | undefined;
let tradingWallets: WalletWithNumber[] = [];
let tokenAddress: string = '';
let tokenName: string = '';
let tokenSymbol: string = '';
let poolKeys: any = null;  // Cache for pool keys
let sessionTimestamp: string;

interface SessionData {
  admin: {
    number: number;
    privateKey: string;
  };
  wallets: Array<{
    number: number;
    privateKey: string;
    generationTimestamp?: string; // Add generationTimestamp to the interface
  }>;
  tokenAddress: string;
  poolKeys: any;
  tokenName: string;
  timestamp: string;
}


const log = (message: string, color: string = 'white') => console.log(chalk[color](message));

// Initialize connection
async function getProvider(): Promise<Connection> {
  connection = new Connection(RPC_URL, 'confirmed');
  log(`Connected to provider: ${RPC_URL}`);
  return connection;
}

// Get Dexscreener data
async function getDexscreenerData(tokenAddress: string): Promise<any> {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    return response.data;
  } catch (error) {
    log(`Failed to fetch token data from Dexscreener: ${error.message}`, 'red');
    return null;
  }
}

async function main() {
  try {
    log('Initializing provider...', 'cyanBright');
    connection = await getProvider();
    log('Provider initialized.', 'cyanBright');

    await fs.promises.mkdir(SESSION_DIR, { recursive: true });

    console.log(chalk.blueBright('Choose option:\n' +
      chalk.white('[1] Start a new session\n') +
      chalk.white('[2] Restart session from a specific point')));
    let sessionOpt = parseInt(prompt('Choose Number: '), 10);

    let currentSessionFileName: string | undefined;

    if (sessionOpt === 1) {
      console.log(chalk.blueBright('Enter token address:'));
      tokenAddress = prompt('Token address: ');

      // Fetch token data
      const tokenData = await getDexscreenerData(tokenAddress);
      if (tokenData && tokenData.pairs && tokenData.pairs.length > 0) {
        const pair = tokenData.pairs[0];
        tokenName = pair.baseToken.name;
        tokenSymbol = pair.baseToken.symbol;
        log(`Token Confirmed: ${tokenName} (${tokenSymbol})`, 'green');

        const now = new Date();
        sessionTimestamp = now.toISOString();

        // Fetch market ID and pool keys
        try {
          const marketId = await getMarketIdForTokenAddress(connection, tokenAddress);
          if (!marketId) {
            log('Market ID not found.', 'red');
            return;
          }

          log('Fetching pool keys...', 'yellow');
          poolKeys = await getPoolKeysForTokenAddress(connection, tokenAddress);
          if (poolKeys) {
            log('Pool keys confirmed', 'green');
          } else {
            log('Pool keys not found', 'red');
          }
        } catch (error) {
          log(`Error fetching pool keys: ${error.message}`, 'red');
          return;
        }

        // Save session immediately after token discovery with placeholder values
        currentSessionFileName = `${tokenName}_${formatTimestampToEST(new Date(sessionTimestamp))}_session.json`;
        log(`Saving session to file: ${currentSessionFileName}`, 'cyanBright');

        const initialSessionData = {
          admin: {
            number: 'to be created',
            privateKey: 'to be created'
          },
          wallets: [],
          tokenAddress,
          poolKeys,
          tokenName,
          timestamp: formatTimestampToEST(new Date(sessionTimestamp))
        };

        try {
          fs.writeFileSync(path.join(SESSION_DIR, currentSessionFileName), JSON.stringify(initialSessionData, null, 2));
          log('Session saved successfully', 'green');
        } catch (error) {
          log('Failed to save initial session', 'red');
          return;
        }

        console.log(chalk.blueBright('Would you like to view additional token information?'));
        console.log(chalk.green('[1] Yes'));
        console.log(chalk.red('[2] No'));
        const viewInfo = prompt('').toLowerCase();
        if (viewInfo === '1') {    
          console.log(chalk.cyanBright(`Price: ${pair.priceUsd} USD`));
          console.log(chalk.cyanBright(`24h Volume: ${pair.volume.h24}`));
          console.log(chalk.cyanBright(`24h Price Change: ${pair.priceChange.h24}%`));
          console.log(chalk.cyanBright(`24h Buys: ${pair.txns.h24.buys}`));
          console.log(chalk.cyanBright(`24h Sells: ${pair.txns.h24.sells}`));
        }

        console.log(chalk.blueBright('Would you like to import an admin wallet?'));
        console.log(chalk.green('[1] Yes'));
        console.log(chalk.red('[2] No'));
        const importAdmin = prompt('').toLowerCase();
        if (importAdmin === '1') {    
          const adminPrivateKey = prompt('Enter admin wallet private key: ');
          adminWallet = createWalletWithNumber(adminPrivateKey, 0);
          log(`Admin wallet imported\nPublic Key: ${adminWallet.publicKey}\nPrivate Key: ${adminWallet.privateKey}`, 'white');

          log(`Updating session file with admin wallet details: ${currentSessionFileName}`, 'cyanBright');
          if (!await saveSession(adminWallet, [], SESSION_DIR, tokenName, sessionTimestamp, tokenAddress, poolKeys, currentSessionFileName)) {
            log('Error updating session with admin wallet. Exiting...', 'red');
            return;
          }
          log('Session updated successfully', 'green');

          log('Deposit funds to the admin wallet and press enter...', 'blueBright');
          prompt('');

          const solBalance = await getSolBalance(adminWallet, connection);
          log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');
        } else {
          log('Creating admin wallet...', 'cyanBright');
          adminWallet = new WalletWithNumber();
          log(`Admin wallet generated\nPublic Key: ${adminWallet.publicKey}\nPrivate Key: ${adminWallet.privateKey}`, 'white');

          log(`Updating session file with admin wallet details: ${currentSessionFileName}`, 'cyanBright');
          if (!await saveSession(adminWallet, [], SESSION_DIR, tokenName, sessionTimestamp, tokenAddress, poolKeys, currentSessionFileName)) {
            log('Error updating session with admin wallet. Exiting...', 'red');
            return;
          }
          log('Session updated successfully', 'green');

          log('Deposit funds to the admin wallet and press enter...', 'blueBright');
          prompt('');

          const solBalance = await getSolBalance(adminWallet, connection);
          log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');
        }

        console.log(chalk.blueBright('How many wallets do you want to create?'));
        const numWallets = parseInt(prompt('Number of wallets: '), 10);

        const solToSend = parseFloat(prompt('Enter amount in SOL: '));

        // Ensure solToSend is correctly dispersed
        const newWallets = Array.from({ length: numWallets }, () => new WalletWithNumber());
        tradingWallets = newWallets;

        log(`Generated ${numWallets} wallets.`, 'magentaBright');

        log(`Saving session after wallet generation to file: ${currentSessionFileName}`, 'blueBright');
        if (!await appendWalletsToSession(tradingWallets, path.join(SESSION_DIR, currentSessionFileName))) {
          log('Error saving session after wallet generation. Exiting...', 'red');
          return;
        }

        const amountToDisperse = solToSend; // Correctly assign total amount to disperse
        log(`Dispersing ${amountToDisperse.toFixed(6)} SOL to ${numWallets} wallets...`, 'yellow');
        const { successWallets } = await distributeSol(adminWallet, tradingWallets, amountToDisperse, connection);
        tradingWallets = successWallets;

        log(`Successfully loaded ${successWallets.length} wallets.`, 'green');

        const adminWalletKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
        const adminTokenBalance = await getTokenBalance(new RaydiumSwap(process.env.RPC_URL!, adminWallet.privateKey), tokenAddress);

        if (adminTokenBalance > 0) {
          console.log(chalk.blueBright(`Do you want to transfer ${tokenSymbol} to the wallets?`));
          console.log(chalk.white('[1] Yes\n[2] No'));
          const transferTokensOpt = parseInt(prompt('Choose Number: '), 10);
          if (transferTokensOpt === 1) {
            const amountPerWallet = adminTokenBalance / tradingWallets.length;
            for (const wallet of tradingWallets) {
              await distributeTokens(adminWallet, new PublicKey(adminWallet.publicKey), [wallet], new PublicKey(tokenAddress), amountPerWallet, 9, connection);
            }
            log('Tokens transferred to wallets', 'green');
          }
        } else {
          log('Admin wallet has 0 tokens', 'yellow');
        }        

        console.log(chalk.blueBright('Choose trading strategy:\n' +
          chalk.white('[1] Increase Makers + Volume\n') +
          chalk.white('[2] Increase Volume Only\n') +
          chalk.white('[3] Liquidity Phase Trading')));
            const tradeStrategyOpt = parseInt(prompt('Choose Number: '), 10);

        let tradeStrategy: string;
        if (tradeStrategyOpt === 1) {
          tradeStrategy = 'INCREASE_MAKERS_VOLUME';
        } else if (tradeStrategyOpt === 2) {
          tradeStrategy = 'INCREASE_VOLUME_ONLY';
        } else if (tradeStrategyOpt === 3) {
          tradeStrategy = 'LIQUIDITY_PHASE_TRADING';
        } else {
          log('Invalid option selected. Defaulting to Increase Volume Only.', 'yellow');
          tradeStrategy = 'INCREASE_VOLUME_ONLY';
        }

        log('Trading initiated .....', 'cyanBright');

        const globalTradingFlag = { value: true }; // Define global trading flag here
        await dynamicTrade(adminWallet, tradingWallets, tokenAddress, tradeStrategy, connection, sessionTimestamp, tokenName, globalTradingFlag);
      } else {
        log('Token not found or invalid response from Dexscreener. Please check the address and try again.', 'red');
        return;
      }
    } else if (sessionOpt === 2) {
      const sessionFiles = fs.readdirSync(SESSION_DIR).filter(file => file.endsWith('_session.json'));
      if (sessionFiles.length === 0) {
        log('No session files found.', 'red');
        return;
      }

      console.log(chalk.blueBright('Select a session file to restart:'));
      sessionFiles.forEach((file, index) => {
        console.log(chalk.white(`[${index + 1}] ${file}`));
      });

      const fileOpt = parseInt(prompt('Choose Number: '), 10);
      const selectedFile = sessionFiles[fileOpt - 1];

      // Load session data
      const sessionData = await loadSession(selectedFile) as SessionData;

      // Initialize admin wallet
      adminWallet = createWalletWithNumber(sessionData.admin.privateKey, sessionData.admin.number);

      // Initialize trading wallets
      tradingWallets = sessionData.wallets.map(wallet =>
        createWalletWithNumber(wallet.privateKey, wallet.number)
      );

      tokenAddress = sessionData.tokenAddress;
      tokenName = sessionData.tokenName;
      poolKeys = sessionData.poolKeys;
      sessionTimestamp = sessionData.timestamp;
      currentSessionFileName = selectedFile;

      console.log(chalk.blueBright('Select a point to restart:'));
      console.log(chalk.white('[1] After token discovery\n[2] After admin wallet creation\n[3] After wallet generation\n[4] After wallet funding\n[5] Token transfer to wallets\n[6] Close Token Account & Send Balance to Admin'));
      const restartOpt = parseInt(prompt('Choose Number: '), 10);

      if (restartOpt === 1) {
        log('Creating admin wallet...', 'cyanBright');
        adminWallet = new WalletWithNumber();
        log(`Admin wallet generated\nPublic Key: ${adminWallet.publicKey}\nPrivate Key: ${adminWallet.privateKey}`, 'white');

        log(`Updating session file with admin wallet details: ${currentSessionFileName}`, 'cyanBright');
        if (!await saveSession(adminWallet, [], SESSION_DIR, tokenName, sessionTimestamp, tokenAddress, poolKeys, currentSessionFileName)) {
          log('Error updating session with admin wallet. Exiting...', 'red');
          return;
        }
        log('Session updated successfully', 'green');

        log('Deposit funds to the admin wallet and press enter...', 'blueBright');
        prompt('');

        const solBalance = await getSolBalance(adminWallet, connection);
        log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');
      }

      if (restartOpt === 2) {
        log('Deposit funds to the admin wallet and press enter...', 'blueBright');
        prompt('');
        const solBalance = await getSolBalance(adminWallet, connection);
        log(`Deposit Successful\nAdmin Wallet SOL: ${solBalance.toFixed(6)}, Tokens: 0`, 'yellow');

        console.log(chalk.blueBright('How many wallets do you want to create?'));
        const numWallets = parseInt(prompt('Number of wallets: '), 10);
        const solToSend = parseFloat(prompt('Enter amount in SOL: '));

        const newWallets = Array.from({ length: numWallets }, () => new WalletWithNumber());
        tradingWallets = newWallets;

        log(`Generated ${numWallets} wallets.`, 'yellow');

        log(`Saving session after wallet generation to file: ${currentSessionFileName}`, 'magenta');
        if (!await appendWalletsToSession(tradingWallets, path.join(SESSION_DIR, currentSessionFileName))) {
          log('Error saving session after wallet generation. Exiting...', 'red');
          return;
        }

        const amountToDisperse = solToSend / numWallets;
        log(`Dispersing ${amountToDisperse.toFixed(6)} SOL to ${numWallets} wallets...`, 'cyanBright');
        const { successWallets } = await distributeSol(adminWallet, tradingWallets, amountToDisperse, connection);
        tradingWallets = successWallets;

        log(`Successfully loaded ${successWallets.length} wallets.`, 'green');
      }

      if (restartOpt === 3) {
        console.log(chalk.blueBright('How much SOL do you want to send?'));
        const solToSend = parseFloat(prompt('Enter amount in SOL: '));

        const amountToDisperse = solToSend / tradingWallets.length;
        log(`Dispersing ${amountToDisperse.toFixed(6)} SOL to ${tradingWallets.length} wallets...`, 'cyanBright');
        const { successWallets } = await distributeSol(adminWallet, tradingWallets, solToSend, connection);
        tradingWallets = successWallets;

        log(`Successfully loaded ${successWallets.length} wallets.`, 'green');
      }

      if (restartOpt === 4) {
        try {
          const adminWalletKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
          const adminTokenBalance = await getTokenBalance(new RaydiumSwap(process.env.RPC_URL!, adminWalletKey), tokenAddress);
          const adminSolBalance = await getSolBalance(adminWallet, connection);
          console.log(chalk.greenBright(`Admin Wallet SOL: ${chalk.white(adminSolBalance.toFixed(6))}, ${tokenName}: ${chalk.white(adminTokenBalance)}`));

          for (const wallet of tradingWallets) {
            const walletRaydiumSwap = new RaydiumSwap(process.env.RPC_URL, wallet.privateKey);
            const walletSolBalance = await getSolBalance(wallet, connection);
            const walletTokenBalance = await getTokenBalance(walletRaydiumSwap, tokenAddress);
            console.log(chalk.greenBright(`Trading Wallet (${chalk.cyan(wallet.number)}) SOL: ${chalk.white(walletSolBalance.toFixed(6))}, ${tokenName}: ${chalk.white(walletTokenBalance)}`));
          }

          console.log(chalk.blueBright('Choose trading strategy:\n' +
            chalk.white('[1] Increase Makers + Volume\n') +
            chalk.white('[2] Increase Volume Only')));
                const tradeStrategyOpt = parseInt(prompt('Choose Number: '), 10);
          const tradeStrategy = tradeStrategyOpt === 1 ? 'INCREASE_MAKERS_VOLUME' : 'INCREASE_VOLUME_ONLY';

          const globalTradingFlag = { value: true }; // Define global trading flag here
          await dynamicTrade(adminWallet, tradingWallets, tokenAddress, tradeStrategy, connection, sessionTimestamp, tokenName, globalTradingFlag);
        } catch (error) {
          log(`Error in restart point 4: ${error.message}`, 'red');
          return;
        }
      }

      if (restartOpt === 5) {
        try {
          const adminWalletKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
          const adminTokenBalance = await getTokenBalance(new RaydiumSwap(process.env.RPC_URL!, adminWalletKey), tokenAddress);

          if (adminTokenBalance > 0) {
            const amountPerWallet = adminTokenBalance / tradingWallets.length;
            for (const wallet of tradingWallets) {
              await distributeTokens(adminWallet, new PublicKey(adminWallet.publicKey), [wallet], new PublicKey(tokenAddress), amountPerWallet, 9, connection);
            }
            log('Tokens transferred to wallets', 'green');
          } else {
            log('Admin wallet has 0 tokens', 'yellow');
          }
          
          console.log(chalk.blueBright('Choose trading strategy:\n[1] Increase Makers + Volume\n[2] Increase Volume Only'));
          const tradeStrategyOpt = parseInt(prompt('Choose Number: '), 10);
          const tradeStrategy = tradeStrategyOpt === 1 ? 'INCREASE_MAKERS_VOLUME' : 'INCREASE_VOLUME_ONLY';

          const globalTradingFlag = { value: true }; // Define global trading flag here
          await dynamicTrade(adminWallet, tradingWallets, tokenAddress, tradeStrategy, connection, sessionTimestamp, tokenName, globalTradingFlag);
        } catch (error) {
          log(`Error in restart point 5: ${error.message}`, 'red');
          return;
        }
      }

      if (restartOpt === 6) {
        try {
          await closeTokenAccountsAndSendBalance(adminWallet, tradingWallets, tokenAddress, connection);
          console.log(chalk.green('All token accounts closed and balances sent to admin wallet.'));
        } catch (error) {
          console.log(chalk.red(`Error in closing token accounts and sending balances: ${error.message}`));
        }
      }

    } else {
      log('Failed to load session. Exiting...', 'red');
      return;
    }
  } catch (error) {
    log('Unhandled error in main function', 'redBright');
    log(error, 'redBright');
  }
}

main().catch(error => {
  log('Unhandled error in main function', 'redBright');
  log(error, 'redBright');
});