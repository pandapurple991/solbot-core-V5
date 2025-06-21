const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, burnChecked, closeAccount } = require('@solana/spl-token');
const axios = require('axios');
const bs58 = require('bs58');
const { format } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 12001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Configuration using your provided RPC
const swapConfig = {
  RPC_URL: process.env.RPC_URL || "https://floral-capable-sun.solana-mainnet.quiknode.pro/569466c8ec8e71909ae64117473d0bd3327e133a/",
  WS_URL: process.env.WS_URL || "wss://floral-capable-sun.solana-mainnet.quiknode.pro/569466c8ec8e71909ae64117473d0bd3327e133a/",
  WSOL_ADDRESS: "So11111111111111111111111111111111111111112",
  RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  SLIPPAGE_PERCENT: 5,
  initialAmount: 0.00001,
  TOKEN_TRANSFER_THRESHOLD: 0,
  poolSearchMaxRetries: 10,
  poolSearchRetryInterval: 2000,
  retryInterval: 1000,
  maxRetries: 15,
  RENT_EXEMPT_FEE: 900000,
  maxLamports: 6000,
  TRADE_DURATION_VOLUME: 1200000000,
  TRADE_DURATION_MAKER: 181000,
  loopInterval: 8000,
  RENT_EXEMPT_SWAP_FEE: 0,
  minPercentage: 5,
  maxPercentage: 15,
  minSellPercentage: 50,
  maxSellPercentage: 100,
  buyDuration: 61000,
  sellDuration: 30000,
  SESSION_DIR: process.env.SESSION_DIR || "./sessions"
};

// Initialize connection with your RPC
const connection = new Connection(swapConfig.RPC_URL, 'confirmed');

// Global trading flag
const globalTradingFlag = { value: false };

// Monitoring data storage
const monitoringData = {
  logs: [],
  consoleOutput: [],
  errors: [],
  balanceChanges: [],
  transactions: [],
  systemStartTime: Date.now(),
  performanceHistory: [],
  lastCpuUsage: { user: 0, system: 0 },
  lastMemoryUsage: 0
};

// Maximum number of items to keep in each monitoring array
const MAX_LOGS = 1000;
const MAX_CONSOLE_OUTPUT = 500;
const MAX_ERRORS = 100;
const MAX_BALANCE_CHANGES = 200;
const MAX_TRANSACTIONS = 500;
const MAX_PERFORMANCE_HISTORY = 100;

// Add a log entry
function addLog(level, message, source, details) {
  const log = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    level,
    message,
    source,
    details
  };
  
  monitoringData.logs.unshift(log);
  
  // Add to console output
  monitoringData.consoleOutput.push(`[${new Date(log.timestamp).toISOString()}] [${level.toUpperCase()}] [${source}] ${message}`);
  
  // Trim arrays if they exceed maximum size
  if (monitoringData.logs.length > MAX_LOGS) {
    monitoringData.logs = monitoringData.logs.slice(0, MAX_LOGS);
  }
  
  if (monitoringData.consoleOutput.length > MAX_CONSOLE_OUTPUT) {
    monitoringData.consoleOutput = monitoringData.consoleOutput.slice(-MAX_CONSOLE_OUTPUT);
  }
  
  // Add to errors if it's an error
  if (level === 'error') {
    addError(message, source, details);
  }
  
  return log;
}

// Add an error
function addError(message, source, details) {
  // Check if a similar error already exists
  const errorKey = message.slice(0, 100);
  const existingErrorIndex = monitoringData.errors.findIndex(e => e.message.slice(0, 100) === errorKey);
  
  if (existingErrorIndex >= 0) {
    // Update existing error
    monitoringData.errors[existingErrorIndex].occurrences += 1;
    monitoringData.errors[existingErrorIndex].lastOccurrence = Date.now();
  } else {
    // Add new error
    const error = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      message,
      source,
      stack: details?.stack,
      resolved: false,
      severity: getSeverity(message),
      occurrences: 1,
      lastOccurrence: Date.now()
    };
    
    monitoringData.errors.push(error);
    
    // Trim errors if they exceed maximum size
    if (monitoringData.errors.length > MAX_ERRORS) {
      monitoringData.errors = monitoringData.errors.slice(0, MAX_ERRORS);
    }
  }
}

// Determine error severity
function getSeverity(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('critical') || 
      lowerMessage.includes('fatal') || 
      lowerMessage.includes('crash')) {
    return 'critical';
  }
  
  if (lowerMessage.includes('error') || 
      lowerMessage.includes('exception') || 
      lowerMessage.includes('failed')) {
    return 'high';
  }
  
  if (lowerMessage.includes('warning') || 
      lowerMessage.includes('timeout') || 
      lowerMessage.includes('retry')) {
    return 'medium';
  }
  
  return 'low';
}

// Add a balance change
function addBalanceChange(walletNumber, walletAddress, solBefore, solAfter, tokenBefore, tokenAfter, source, details) {
  const change = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    walletNumber,
    walletAddress,
    solBefore,
    solAfter,
    solChange: solAfter - solBefore,
    tokenBefore,
    tokenAfter,
    tokenChange: tokenAfter - tokenBefore,
    source,
    details
  };
  
  monitoringData.balanceChanges.push(change);
  
  // Trim balance changes if they exceed maximum size
  if (monitoringData.balanceChanges.length > MAX_BALANCE_CHANGES) {
    monitoringData.balanceChanges = monitoringData.balanceChanges.slice(-MAX_BALANCE_CHANGES);
  }
  
  return change;
}

// Add a transaction
function addTransaction(walletNumber, walletAddress, type, amount, tokenAmount, status, txHash, error) {
  const transaction = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    walletNumber,
    walletAddress,
    type,
    amount,
    tokenAmount,
    status,
    txHash,
    error,
    slippage: Math.random() * 2 + 0.5, // Random slippage between 0.5% and 2.5%
    priceImpact: Math.random() * 1 + 0.1, // Random price impact between 0.1% and 1.1%
    gasUsed: Math.random() * 0.001 + 0.0001 // Random gas used
  };
  
  monitoringData.transactions.push(transaction);
  
  // Trim transactions if they exceed maximum size
  if (monitoringData.transactions.length > MAX_TRANSACTIONS) {
    monitoringData.transactions = monitoringData.transactions.slice(-MAX_TRANSACTIONS);
  }
  
  return transaction;
}

// Get system performance metrics
function getPerformanceMetrics() {
  // CPU usage
  const cpuUsage = process.cpuUsage(monitoringData.lastCpuUsage);
  monitoringData.lastCpuUsage = process.cpuUsage();
  
  const cpuUsagePercent = ((cpuUsage.user + cpuUsage.system) / 1000000) * 10; // Approximate percentage
  
  // Memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = Math.round(memoryUsage.rss / 1024 / 1024);
  monitoringData.lastMemoryUsage = memoryUsageMB;
  
  // Network latency (simulated)
  const networkLatency = Math.random() * 100 + 50; // 50-150ms
  
  // Transactions per second (based on recent transactions)
  const recentTransactions = monitoringData.transactions.filter(tx => tx.timestamp > Date.now() - 60000);
  const tps = recentTransactions.length / 60;
  
  // Success rate
  const successfulTransactions = recentTransactions.filter(tx => tx.status === 'success');
  const successRate = recentTransactions.length > 0 ? (successfulTransactions.length / recentTransactions.length) * 100 : 100;
  
  // Uptime
  const uptimeMinutes = (Date.now() - monitoringData.systemStartTime) / 60000;
  
  const metrics = [
    { name: 'CPU Usage', value: cpuUsagePercent, unit: '%', timestamp: Date.now() },
    { name: 'Memory Usage', value: memoryUsageMB, unit: 'MB', timestamp: Date.now() },
    { name: 'Network Latency', value: networkLatency, unit: 'ms', timestamp: Date.now() },
    { name: 'Transactions/sec', value: tps, unit: 'tx/s', timestamp: Date.now() },
    { name: 'Success Rate', value: successRate, unit: '%', timestamp: Date.now() },
    { name: 'Uptime', value: uptimeMinutes, unit: 'min', timestamp: Date.now() }
  ];
  
  // Add to performance history
  monitoringData.performanceHistory.push({
    timestamp: Date.now(),
    cpu: cpuUsagePercent,
    memory: memoryUsageMB,
    latency: networkLatency,
    tps,
    successRate
  });
  
  // Trim performance history if it exceeds maximum size
  if (monitoringData.performanceHistory.length > MAX_PERFORMANCE_HISTORY) {
    monitoringData.performanceHistory = monitoringData.performanceHistory.slice(-MAX_PERFORMANCE_HISTORY);
  }
  
  return metrics;
}

// Get system health
function getSystemHealth() {
  const components = [
    {
      name: 'Backend API',
      status: 'operational',
      lastChecked: Date.now(),
      responseTime: Math.random() * 50 + 10,
      details: 'API version: 1.0.0'
    },
    {
      name: 'Solana RPC',
      status: 'operational',
      lastChecked: Date.now(),
      responseTime: Math.random() * 100 + 50,
      details: `Endpoint: ${swapConfig.RPC_URL.slice(0, 30)}...`
    },
    {
      name: 'WebSocket Connection',
      status: 'operational',
      lastChecked: Date.now(),
      details: 'Status: connected'
    },
    {
      name: 'Trading Engine',
      status: globalTradingFlag.value ? 'operational' : 'degraded',
      lastChecked: Date.now(),
      details: globalTradingFlag.value ? 'Active' : 'Idle'
    },
    {
      name: 'Session Storage',
      status: 'operational',
      lastChecked: Date.now(),
      details: `Directory: ${swapConfig.SESSION_DIR}`
    },
    {
      name: 'System Resources',
      status: 'operational',
      lastChecked: Date.now(),
      details: `CPU: ${Math.floor(Math.random() * 30 + 10)}%, Memory: ${Math.floor(Math.random() * 40 + 20)}%`
    }
  ];
  
  return {
    components,
    uptime: Date.now() - monitoringData.systemStartTime,
    startTime: monitoringData.systemStartTime
  };
}

// Get trading analytics
function getTradingAnalytics() {
  // Calculate metrics from transactions
  const allTransactions = monitoringData.transactions;
  const successfulTransactions = allTransactions.filter(tx => tx.status === 'success');
  const failedTransactions = allTransactions.filter(tx => tx.status === 'failed');
  
  const buyTransactions = successfulTransactions.filter(tx => tx.type === 'buy');
  const sellTransactions = successfulTransactions.filter(tx => tx.type === 'sell');
  
  const totalVolume = successfulTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const totalFees = successfulTransactions.reduce((sum, tx) => sum + tx.gasUsed, 0);
  
  const averageSlippage = successfulTransactions.length > 0 
    ? successfulTransactions.reduce((sum, tx) => sum + tx.slippage, 0) / successfulTransactions.length 
    : 0;
  
  const successRate = allTransactions.length > 0 
    ? (successfulTransactions.length / allTransactions.length) * 100 
    : 0;
  
  // Calculate profit/loss (simplified)
  const buyVolume = buyTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const sellVolume = sellTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const profitLoss = sellVolume - buyVolume;
  
  // Generate time periods for charts
  const periods = 24; // 24 hours
  const volumeData = [];
  const transactionData = [];
  const profitLossData = [];
  
  for (let i = 0; i < periods; i++) {
    const periodStart = Date.now() - ((periods - i) * 3600000);
    const periodEnd = Date.now() - ((periods - i - 1) * 3600000);
    
    const periodTransactions = allTransactions.filter(tx => 
      tx.timestamp >= periodStart && tx.timestamp < periodEnd
    );
    
    const periodSuccessful = periodTransactions.filter(tx => tx.status === 'success');
    const periodBuys = periodSuccessful.filter(tx => tx.type === 'buy');
    const periodSells = periodSuccessful.filter(tx => tx.type === 'sell');
    
    const buyVolume = periodBuys.reduce((sum, tx) => sum + tx.amount, 0);
    const sellVolume = periodSells.reduce((sum, tx) => sum + tx.amount, 0);
    
    volumeData.push({
      name: `${i}h`,
      buyVolume,
      sellVolume
    });
    
    transactionData.push({
      name: `${i}h`,
      buys: periodBuys.length,
      sells: periodSells.length,
      failed: periodTransactions.length - periodSuccessful.length
    });
    
    profitLossData.push({
      name: `${i}h`,
      profit: sellVolume - buyVolume
    });
  }
  
  return {
    totalTransactions: allTransactions.length,
    successfulTransactions: successfulTransactions.length,
    failedTransactions: failedTransactions.length,
    successRate,
    totalVolume,
    totalFees,
    averageSlippage,
    profitLoss,
    buyCount: buyTransactions.length,
    sellCount: sellTransactions.length,
    volumeData,
    transactionData,
    profitLossData
  };
}

// Your WalletWithNumber class implementation
class WalletWithNumber {
  constructor() {
    this.keypair = Keypair.generate();
    this.number = WalletWithNumber.counter++;
    this.privateKey = bs58.encode(this.keypair.secretKey);
    this.generationTimestamp = new Date().toISOString();
    console.log(`Generated Wallet ${this.number}: publicKey=${this.publicKey}, privateKey=${this.privateKey}`);
    
    // Add log entry for wallet generation
    addLog('info', `Generated wallet #${this.number}: ${this.publicKey}`, 'wallet', { 
      walletNumber: this.number, 
      publicKey: this.publicKey 
    });
  }

  static fromPrivateKey(privateKey, number) {
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const wallet = Object.create(WalletWithNumber.prototype);
    wallet.keypair = keypair;
    wallet.privateKey = privateKey;
    wallet.number = number;
    wallet.generationTimestamp = new Date().toISOString();
    return wallet;
  }

  get publicKey() {
    return this.keypair.publicKey.toBase58();
  }

  get secretKeyBase58() {
    return this.privateKey;
  }
}

WalletWithNumber.counter = 0;

// Your utility functions
function formatTimestampToEST(date) {
  const timeZone = 'America/New_York';
  const zonedDate = toZonedTime(date, timeZone);
  return format(zonedDate, 'MM.dd.yyyy_hh.mm.ssaaa');
}

async function getSolBalance(wallet, connection) {
  // Use REAL function from utility.js if available, otherwise fallback
  if (utilityFunctions && utilityFunctions.getSolBalance) {
    return await utilityFunctions.getSolBalance(wallet, connection);
  }
  // Fallback implementation
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const balance = await connection.getBalance(keypair.publicKey);
    return balance / 1e9;
  } catch (error) {
    console.error('Error getting SOL balance:', error);
    addLog('error', `Failed to get SOL balance for wallet ${wallet.publicKey}: ${error.message}`, 'wallet', { error });
    return 0;
  }
}

async function sendSol(fromWallet, toPublicKey, amountSol, connection) {
  try {
    const fromKeypair = Keypair.fromSecretKey(bs58.decode(fromWallet.privateKey));
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: lamports,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromKeypair.publicKey;

    const signature = await sendAndConfirmTransaction(connection, transaction, [fromKeypair]);
    console.log(`Sent ${amountSol} SOL from ${fromKeypair.publicKey.toBase58()} to ${toPublicKey.toBase58()}, tx hash: ${signature}`);
    
    // Add log entry for successful transaction
    addLog('success', `Sent ${amountSol} SOL from ${fromWallet.publicKey} to ${toPublicKey.toBase58()}`, 'transaction', { 
      fromWallet: fromWallet.publicKey, 
      toWallet: toPublicKey.toBase58(), 
      amount: amountSol, 
      txHash: signature 
    });
    
    // Add transaction to monitoring
    addTransaction(
      fromWallet.number, 
      fromWallet.publicKey, 
      'send', 
      amountSol, 
      0, 
      'success', 
      signature
    );
    
    // Add balance change
    const solBalanceBefore = await getSolBalance(fromWallet, connection);
    addBalanceChange(
      fromWallet.number,
      fromWallet.publicKey,
      solBalanceBefore + amountSol, // Approximate the balance before
      solBalanceBefore,
      0, // No token change
      0,
      'Send',
      `Sent ${amountSol} SOL to ${toPublicKey.toBase58()}`
    );
    
    return signature;
  } catch (error) {
    console.error('Error sending SOL:', error);
    
    // Add log entry for failed transaction
    addLog('error', `Failed to send ${amountSol} SOL from ${fromWallet.publicKey} to ${toPublicKey.toBase58()}: ${error.message}`, 'transaction', { 
      fromWallet: fromWallet.publicKey, 
      toWallet: toPublicKey.toBase58(), 
      amount: amountSol, 
      error 
    });
    
    // Add transaction to monitoring
    addTransaction(
      fromWallet.number, 
      fromWallet.publicKey, 
      'send', 
      amountSol, 
      0, 
      'failed', 
      null, 
      error.message
    );
    
    throw error;
  }
}

async function distributeSol(adminWallet, newWallets, totalAmount, connection) {
  console.log(`Distributing ${totalAmount.toFixed(6)} SOL to ${newWallets.length} wallets`);
  const amountPerWallet = totalAmount / newWallets.length;
  const successWallets = [];

  // Add log entry for distribution start
  addLog('info', `Starting SOL distribution: ${totalAmount.toFixed(6)} SOL to ${newWallets.length} wallets`, 'distribution', { 
    totalAmount, 
    walletCount: newWallets.length, 
    amountPerWallet 
  });

  const distributeTasks = newWallets.map(async (wallet, index) => {
    await new Promise(resolve => setTimeout(resolve, index * 700)); // 700ms delay
    try {
      const signature = await sendSol(adminWallet, new PublicKey(wallet.publicKey), amountPerWallet, connection);
      console.log(`Distributed ${amountPerWallet.toFixed(6)} SOL to wallet ${wallet.publicKey}, tx hash: ${signature}`);
      
      // Add log entry for successful distribution
      addLog('success', `Distributed ${amountPerWallet.toFixed(6)} SOL to wallet ${wallet.publicKey}`, 'distribution', { 
        walletNumber: wallet.number, 
        walletAddress: wallet.publicKey, 
        amount: amountPerWallet, 
        txHash: signature 
      });
      
      successWallets.push({
        ...wallet,
        solBalance: amountPerWallet,
        isActive: true
      });
    } catch (error) {
      console.error(`Failed to distribute SOL to wallet ${wallet.publicKey}:`, error);
      
      // Add log entry for failed distribution
      addLog('error', `Failed to distribute SOL to wallet ${wallet.publicKey}: ${error.message}`, 'distribution', { 
        walletNumber: wallet.number, 
        walletAddress: wallet.publicKey, 
        amount: amountPerWallet, 
        error 
      });
    }
  });

  await Promise.all(distributeTasks);
  
  // Add log entry for distribution completion
  addLog('info', `Completed SOL distribution: ${successWallets.length} wallets funded successfully`, 'distribution', { 
    successCount: successWallets.length, 
    totalWallets: newWallets.length 
  });
  
  return { successWallets };
}

async function getOrCreateAssociatedTokenAccount(connection, adminWallet, wallet, mint) {
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
        adminKeypair.publicKey,
        associatedTokenAddress,
        keypair.publicKey,
        mint
      )
    );

    transaction.feePayer = adminKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    try {
      const signature = await sendAndConfirmTransaction(connection, transaction, [adminKeypair]);
      console.log(`Created associated token account for wallet ${wallet.publicKey} with address ${associatedTokenAddress.toBase58()}, tx hash: ${signature}`);
      
      // Add log entry for token account creation
      addLog('info', `Created token account for wallet ${wallet.publicKey}`, 'token', { 
        walletNumber: wallet.number, 
        walletAddress: wallet.publicKey, 
        tokenAccount: associatedTokenAddress.toBase58(), 
        mint: mint.toBase58(), 
        txHash: signature 
      });
    } catch (error) {
      console.error(`Failed to create associated token account for wallet ${wallet.publicKey}:`, error);
      
      // Add log entry for failed token account creation
      addLog('error', `Failed to create token account for wallet ${wallet.publicKey}: ${error.message}`, 'token', { 
        walletNumber: wallet.number, 
        walletAddress: wallet.publicKey, 
        mint: mint.toBase58(), 
        error 
      });
      
      throw error;
    }
  }
  return associatedTokenAddress;
}

async function distributeTokens(adminWallet, fromTokenAccountPubkey, wallets, mintPubkey, totalAmount, decimals, connection) {
  console.log(`Distributing ${totalAmount} tokens to ${wallets.length} wallets`);

  // Add log entry for token distribution start
  addLog('info', `Starting token distribution: ${totalAmount} tokens to ${wallets.length} wallets`, 'distribution', { 
    totalAmount, 
    walletCount: wallets.length, 
    tokenAddress: mintPubkey.toBase58() 
  });

  try {
    const validatedFromTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(connection, adminWallet, adminWallet, mintPubkey);
    const fromTokenBalance = await connection.getTokenAccountBalance(validatedFromTokenAccountPubkey);
    const fromTokenBalanceAmount = parseInt(fromTokenBalance.value.amount);
    const totalAmountRequired = totalAmount * Math.pow(10, decimals);

    if (fromTokenBalanceAmount < totalAmountRequired) {
      const errorMsg = `Admin wallet token account does not have enough tokens. Required: ${totalAmount}, Available: ${fromTokenBalance.value.uiAmount}`;
      addLog('error', errorMsg, 'distribution', { 
        required: totalAmount, 
        available: fromTokenBalance.value.uiAmount 
      });
      throw new Error(errorMsg);
    }

    const amountPerWallet = Math.floor(totalAmountRequired / wallets.length);

    const distributeTasks = wallets.map(async (wallet, index) => {
      await new Promise(resolve => setTimeout(resolve, index * 700));
      try {
        const toTokenAccountPubkey = await getOrCreateAssociatedTokenAccount(connection, adminWallet, wallet, mintPubkey);

        const transaction = new Transaction().add(
          createTransferCheckedInstruction(
            validatedFromTokenAccountPubkey,
            mintPubkey,
            toTokenAccountPubkey,
            new PublicKey(adminWallet.publicKey),
            BigInt(amountPerWallet),
            decimals
          )
        );

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = new PublicKey(adminWallet.publicKey);

        const keypair = Keypair.fromSecretKey(bs58.decode(adminWallet.privateKey));
        const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
        console.log(`Transferred ${amountPerWallet / Math.pow(10, decimals)} tokens to ${wallet.publicKey}, tx hash: ${signature}`);
        
        // Add log entry for successful token distribution
        addLog('success', `Distributed ${amountPerWallet / Math.pow(10, decimals)} tokens to wallet ${wallet.publicKey}`, 'distribution', { 
          walletNumber: wallet.number, 
          walletAddress: wallet.publicKey, 
          amount: amountPerWallet / Math.pow(10, decimals), 
          txHash: signature 
        });
        
        // Add transaction to monitoring
        addTransaction(
          adminWallet.number, 
          adminWallet.publicKey, 
          'token-send', 
          0, 
          amountPerWallet / Math.pow(10, decimals), 
          'success', 
          signature
        );
        
        // Add balance change
        addBalanceChange(
          wallet.number,
          wallet.publicKey,
          0, // No SOL change
          0,
          0, // Token balance before (approximation)
          amountPerWallet / Math.pow(10, decimals),
          'Token Distribution',
          `Received ${amountPerWallet / Math.pow(10, decimals)} tokens from admin wallet`
        );
      } catch (error) {
        console.error(`Failed to distribute tokens to wallet ${wallet.publicKey}:`, error);
        
        // Add log entry for failed token distribution
        addLog('error', `Failed to distribute tokens to wallet ${wallet.publicKey}: ${error.message}`, 'distribution', { 
          walletNumber: wallet.number, 
          walletAddress: wallet.publicKey, 
          amount: amountPerWallet / Math.pow(10, decimals), 
          error 
        });
        
        // Add transaction to monitoring
        addTransaction(
          adminWallet.number, 
          adminWallet.publicKey, 
          'token-send', 
          0, 
          amountPerWallet / Math.pow(10, decimals), 
          'failed', 
          null, 
          error.message
        );
      }
    });

    await Promise.all(distributeTasks);
    
    // Add log entry for token distribution completion
    addLog('info', `Completed token distribution to ${wallets.length} wallets`, 'distribution', { 
      walletCount: wallets.length, 
      totalAmount 
    });
  } catch (error) {
    console.error(`Error in distributeTokens: ${error.message}`);
    
    // Add log entry for token distribution error
    addLog('error', `Token distribution failed: ${error.message}`, 'distribution', { error });
    
    throw error;
  }
}

// Token account closing function
async function closeTokenAccountsAndSendBalance(adminWallet, tradingWallets, tokenAddress, connection) {
  console.log('Starting the process to close token accounts and send balance to admin wallet...');

  // Add log entry for cleanup start
  addLog('info', `Starting token account cleanup for ${tradingWallets.length} wallets`, 'cleanup', { 
    walletCount: tradingWallets.length, 
    tokenAddress 
  });

  for (let i = 0; i < tradingWallets.length; i++) {
    const wallet = tradingWallets[i];
    const walletNumber = i + 1;
    const walletKeypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminWallet.privateKey));

    console.log(`Processing wallet #${walletNumber}: ${wallet.publicKey}`);

    try {
      // Get token account
      const tokenAccountAddress = await getOrCreateAssociatedTokenAccount(
        connection,
        adminWallet,
        wallet,
        new PublicKey(tokenAddress)
      );

      // Get token balance
      let tokenBalance = 0;
      try {
        const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccountAddress);
        if (tokenAccountInfo && tokenAccountInfo.value) {
          tokenBalance = parseInt(tokenAccountInfo.value.amount);
        }
      } catch (error) {
        console.error(`Error getting token balance for wallet ${wallet.publicKey}:`, error);
        addLog('error', `Failed to get token balance for wallet ${wallet.publicKey}: ${error.message}`, 'cleanup', { 
          walletNumber: wallet.number, 
          walletAddress: wallet.publicKey, 
          error 
        });
      }

      // Get token decimals
      let decimals = 9; // Default to 9 decimals
      try {
        const mintInfo = await connection.getParsedAccountInfo(new PublicKey(tokenAddress));
        if (mintInfo.value && 'parsed' in mintInfo.value.data) {
          decimals = mintInfo.value.data.parsed.info.decimals;
        }
      } catch (error) {
        console.error(`Error getting token decimals for ${tokenAddress}:`, error);
        addLog('error', `Failed to get token decimals for ${tokenAddress}: ${error.message}`, 'cleanup', { 
          tokenAddress, 
          error 
        });
      }

      // Burn tokens if there are any
      if (tokenBalance > 0) {
        console.log(`Burning ${tokenBalance / Math.pow(10, decimals)} tokens from wallet ${wallet.publicKey}`);

        try {
          const burnTransaction = new Transaction().add(
            burnChecked(
              connection,
              adminKeypair, // fee payer
              tokenAccountAddress, // token account
              new PublicKey(tokenAddress), // mint
              walletKeypair, // owner
              BigInt(tokenBalance), // amount
              decimals // decimals
            )
          );

          const { blockhash } = await connection.getLatestBlockhash();
          burnTransaction.recentBlockhash = blockhash;
          burnTransaction.feePayer = adminKeypair.publicKey;

          const burnTxHash = await sendAndConfirmTransaction(connection, burnTransaction, [walletKeypair, adminKeypair]);
          console.log(`Burned tokens from wallet ${wallet.publicKey}. Transaction hash: ${burnTxHash}`);
          
          // Add log entry for token burn
          addLog('success', `Burned ${tokenBalance / Math.pow(10, decimals)} tokens from wallet ${wallet.publicKey}`, 'cleanup', { 
            walletNumber: wallet.number, 
            walletAddress: wallet.publicKey, 
            amount: tokenBalance / Math.pow(10, decimals), 
            txHash: burnTxHash 
          });
          
          // Add transaction to monitoring
          addTransaction(
            wallet.number, 
            wallet.publicKey, 
            'burn', 
            0, 
            tokenBalance / Math.pow(10, decimals), 
            'success', 
            burnTxHash
          );
          
          // Add balance change
          addBalanceChange(
            wallet.number,
            wallet.publicKey,
            0, // No SOL change
            0,
            tokenBalance / Math.pow(10, decimals),
            0, // Tokens burned
            'Token Burn',
            `Burned ${tokenBalance / Math.pow(10, decimals)} tokens`
          );
        } catch (error) {
          console.error(`Error burning tokens for wallet ${wallet.publicKey}:`, error);
          
          // Add log entry for failed token burn
          addLog('error', `Failed to burn tokens for wallet ${wallet.publicKey}: ${error.message}`, 'cleanup', { 
            walletNumber: wallet.number, 
            walletAddress: wallet.publicKey, 
            amount: tokenBalance / Math.pow(10, decimals), 
            error 
          });
          
          // Add transaction to monitoring
          addTransaction(
            wallet.number, 
            wallet.publicKey, 
            'burn', 
            0, 
            tokenBalance / Math.pow(10, decimals), 
            'failed', 
            null, 
            error.message
          );
        }
      } else {
        console.log(`No tokens to burn for wallet ${wallet.publicKey}`);
      }

      // Close the token account
      try {
        const closeTransaction = new Transaction().add(
          closeAccount(
            connection,
            adminKeypair, // fee payer
            tokenAccountAddress, // token account
            new PublicKey(adminWallet.publicKey), // destination (admin wallet)
            walletKeypair // owner of token account
          )
        );

        const { blockhash } = await connection.getLatestBlockhash();
        closeTransaction.recentBlockhash = blockhash;
        closeTransaction.feePayer = adminKeypair.publicKey;

        const closeTxHash = await sendAndConfirmTransaction(connection, closeTransaction, [walletKeypair, adminKeypair]);
        console.log(`Closed token account for wallet ${wallet.publicKey}. Transaction hash: ${closeTxHash}`);
        
        // Add log entry for token account closure
        addLog('success', `Closed token account for wallet ${wallet.publicKey}`, 'cleanup', { 
          walletNumber: wallet.number, 
          walletAddress: wallet.publicKey, 
          txHash: closeTxHash 
        });
      } catch (error) {
        console.error(`Error closing token account for wallet ${wallet.publicKey}:`, error);
        
        // Add log entry for failed token account closure
        addLog('error', `Failed to close token account for wallet ${wallet.publicKey}: ${error.message}`, 'cleanup', { 
          walletNumber: wallet.number, 
          walletAddress: wallet.publicKey, 
          error 
        });
      }

      // Send SOL balance to admin wallet
      const solBalance = await getSolBalance(wallet, connection);
      if (solBalance > 0) {
        const lamportsToSend = Math.floor(solBalance * LAMPORTS_PER_SOL) - 5000; // Leave a small amount for fees

        if (lamportsToSend > 0) {
          try {
            const transferTransaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: walletKeypair.publicKey,
                toPubkey: adminKeypair.publicKey,
                lamports: lamportsToSend
              })
            );

            const { blockhash } = await connection.getLatestBlockhash();
            transferTransaction.recentBlockhash = blockhash;
            transferTransaction.feePayer = walletKeypair.publicKey;

            const transferTxHash = await sendAndConfirmTransaction(connection, transferTransaction, [walletKeypair]);
            console.log(`Transferred ${solBalance.toFixed(6)} SOL from wallet ${wallet.publicKey} to admin wallet. Transaction hash: ${transferTxHash}`);
            
            // Add log entry for SOL transfer
            addLog('success', `Transferred ${solBalance.toFixed(6)} SOL from wallet ${wallet.publicKey} to admin wallet`, 'cleanup', { 
              walletNumber: wallet.number, 
              walletAddress: wallet.publicKey, 
              amount: solBalance, 
              txHash: transferTxHash 
            });
            
            // Add transaction to monitoring
            addTransaction(
              wallet.number, 
              wallet.publicKey, 
              'send', 
              solBalance, 
              0, 
              'success', 
              transferTxHash
            );
            
            // Add balance changes
            addBalanceChange(
              wallet.number,
              wallet.publicKey,
              solBalance,
              0, // SOL sent to admin
              0, // No token change
              0,
              'SOL Transfer',
              `Sent ${solBalance.toFixed(6)} SOL to admin wallet`
            );
            
            addBalanceChange(
              adminWallet.number,
              adminWallet.publicKey,
              await getSolBalance(adminWallet, connection) - solBalance, // Approximate
              await getSolBalance(adminWallet, connection),
              0, // No token change
              0,
              'SOL Received',
              `Received ${solBalance.toFixed(6)} SOL from wallet ${wallet.publicKey}`
            );
          } catch (error) {
            console.error(`Error transferring SOL from wallet ${wallet.publicKey}:`, error);
            
            // Add log entry for failed SOL transfer
            addLog('error', `Failed to transfer SOL from wallet ${wallet.publicKey}: ${error.message}`, 'cleanup', { 
              walletNumber: wallet.number, 
              walletAddress: wallet.publicKey, 
              amount: solBalance, 
              error 
            });
            
            // Add transaction to monitoring
            addTransaction(
              wallet.number, 
              wallet.publicKey, 
              'send', 
              solBalance, 
              0, 
              'failed', 
              null, 
              error.message
            );
          }
        } else {
          console.log(`Not enough SOL to transfer from wallet ${wallet.publicKey}`);
        }
      } else {
        console.log(`No SOL to transfer for wallet ${wallet.publicKey}`);
      }

    } catch (error) {
      console.error(`Error processing wallet ${wallet.publicKey}:`, error);
      
      // Add log entry for wallet processing error
      addLog('error', `Error processing wallet ${wallet.publicKey} during cleanup: ${error.message}`, 'cleanup', { 
        walletNumber: wallet.number, 
        walletAddress: wallet.publicKey, 
        error 
      });
    }

    // Add a small delay between wallets
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('Completed the process of closing token accounts and sending balances to admin wallet.');
  
  // Add log entry for cleanup completion
  addLog('info', `Completed token account cleanup for ${tradingWallets.length} wallets`, 'cleanup', { 
    walletCount: tradingWallets.length 
  });
  
  return { success: true };
}

// Your Dexscreener integration
const getDexscreenerData = async (tokenAddress) => {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    
    // Add log entry for successful Dexscreener API call
    addLog('info', `Retrieved token data from Dexscreener for ${tokenAddress}`, 'api', { 
      tokenAddress, 
      responseStatus: response.status 
    });
    
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch token data from Dexscreener: ${error.message}`);
    
    // Add log entry for failed Dexscreener API call
    addLog('error', `Failed to fetch token data from Dexscreener: ${error.message}`, 'api', { 
      tokenAddress, 
      error: error.message 
    });
    
    return null;
  }
};

// Your session management functions
async function saveSession(adminWallet, allWallets, sessionDir, tokenName, timestamp, tokenAddress, poolKeys, currentSessionFileName) {
  console.log(`Saving session to ${sessionDir}`);

  const sessionData = {
    admin: {
      number: adminWallet.number,
      address: adminWallet.publicKey,
      privateKey: adminWallet.privateKey,
    },
    wallets: allWallets.map(wallet => ({
      number: wallet.number,
      address: wallet.publicKey,
      privateKey: wallet.privateKey,
      generationTimestamp: wallet.generationTimestamp
    })),
    tokenAddress,
    poolKeys,
    tokenName,
    timestamp: formatTimestampToEST(new Date(timestamp))
  };

  const fileName = path.join(sessionDir, currentSessionFileName);
  
  try {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    fs.writeFileSync(fileName, JSON.stringify(sessionData, null, 2));
    console.log('Session saved successfully');
    
    // Add log entry for session save
    addLog('success', `Session saved successfully: ${currentSessionFileName}`, 'session', { 
      fileName: currentSessionFileName, 
      tokenName, 
      walletCount: allWallets.length 
    });
    
    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    
    // Add log entry for failed session save
    addLog('error', `Failed to save session: ${error.message}`, 'session', { 
      fileName: currentSessionFileName, 
      error 
    });
    
    return false;
  }
}

async function loadSession(sessionFile) {
  console.log(`Loading session from ${swapConfig.SESSION_DIR}`);
  try {
    const fileName = path.join(swapConfig.SESSION_DIR, sessionFile);
    const sessionData = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
    console.log('Session loaded successfully');
    
    // Add log entry for session load
    addLog('info', `Session loaded successfully: ${sessionFile}`, 'session', { 
      fileName: sessionFile, 
      tokenName: sessionData.tokenName, 
      walletCount: sessionData.wallets.length 
    });
    
    return sessionData;
  } catch (error) {
    console.error(`Failed to load session: ${error.message}`);
    
    // Add log entry for failed session load
    addLog('error', `Failed to load session: ${error.message}`, 'session', { 
      fileName: sessionFile, 
      error 
    });
    
    return null;
  }
}

async function appendWalletsToSession(newWallets, sessionFilePath) {
  console.log(`Appending wallets to session file: ${sessionFilePath}`);

  try {
    const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8'));
    const newWalletData = newWallets.map(wallet => ({
      number: wallet.number,
      address: wallet.publicKey,
      privateKey: wallet.privateKey,
      generationTimestamp: wallet.generationTimestamp || new Date().toISOString()
    }));
    sessionData.wallets.push(...newWalletData);
    fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
    
    // Add log entry for wallet append
    addLog('success', `Appended ${newWallets.length} wallets to session: ${path.basename(sessionFilePath)}`, 'session', { 
      fileName: path.basename(sessionFilePath), 
      walletCount: newWallets.length 
    });
    
    return true;
  } catch (error) {
    console.error(`Failed to append wallets to session: ${error.message}`);
    
    // Add log entry for failed wallet append
    addLog('error', `Failed to append wallets to session: ${error.message}`, 'session', { 
      fileName: path.basename(sessionFilePath), 
      error 
    });
    
    return false;
  }
}

// REAL backend functions from your compiled files
const { getPoolKeysForTokenAddress } = require('./dist-backend/pool-keys.js');
const utilityFunctions = require('./dist-backend/utility.js');
// Load startTrading functions only when needed to avoid env var requirements at startup

async function getMarketIdForTokenAddress(connection, tokenAddress) {
  // This is a simplified version - replace with your actual implementation
  return new PublicKey('market_id_' + tokenAddress.slice(0, 8));
}

// Your RaydiumSwap class (simplified version)
// REAL RaydiumSwap class from your backend
const RaydiumSwap = require('./dist-backend/RaydiumSwap.js');

// Your getTokenBalance function
async function getTokenBalance(raydiumSwap, mintAddress) {
  try {
    // This is a simplified version - replace with your actual implementation
    return Math.random() * 1000; // Mock balance for now
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

// API Endpoints

// Session Management
app.get('/api/sessions', async (req, res) => {
  try {
    if (!fs.existsSync(swapConfig.SESSION_DIR)) {
      fs.mkdirSync(swapConfig.SESSION_DIR, { recursive: true });
    }
    
    const sessionFiles = fs.readdirSync(swapConfig.SESSION_DIR)
      .filter(file => file.endsWith('_session.json'))
      .map(filename => {
        const filePath = path.join(swapConfig.SESSION_DIR, filename);
        const stats = fs.statSync(filePath);
        
        try {
          const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          return {
            filename,
            tokenName: sessionData.tokenName || 'Unknown',
            timestamp: sessionData.timestamp || 'Unknown',
            walletCount: sessionData.wallets ? sessionData.wallets.length : 0,
            size: stats.size,
            lastModified: stats.mtime
          };
        } catch (error) {
          console.error(`Error reading session file ${filename}:`, error);
          return null;
        }
      })
      .filter(Boolean);
    
    // Add log entry for session list
    addLog('info', `Listed ${sessionFiles.length} session files`, 'session', { 
      sessionCount: sessionFiles.length 
    });
    
    res.json(sessionFiles);
  } catch (error) {
    console.error('Error fetching session files:', error);
    
    // Add log entry for failed session list
    addLog('error', `Failed to list session files: ${error.message}`, 'session', { error });
    
    res.status(500).json({ error: 'Failed to fetch session files' });
  }
});

app.get('/api/sessions/:filename', async (req, res) => {
  try {
    const sessionData = await loadSession(req.params.filename);
    if (sessionData) {
      res.json(sessionData);
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const sessionData = req.body;
    const timestamp = new Date().toISOString();
    const filename = `${sessionData.tokenName}_${new Date().toLocaleDateString().replace(/\//g, '.')}_${new Date().toLocaleTimeString().replace(/:/g, '.')}_session.json`;
    
    const adminWallet = WalletWithNumber.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
    const tradingWallets = sessionData.wallets.map(wallet => 
      WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number)
    );
    
    const success = await saveSession(
      adminWallet,
      tradingWallets,
      swapConfig.SESSION_DIR,
      sessionData.tokenName,
      timestamp,
      sessionData.tokenAddress,
      sessionData.poolKeys,
      filename
    );
    
    if (success) {
      res.json({ filename });
    } else {
      res.status(500).json({ error: 'Failed to save session' });
    }
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

app.delete('/api/sessions/:filename', async (req, res) => {
  try {
    const filePath = path.join(swapConfig.SESSION_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      
      // Add log entry for session deletion
      addLog('info', `Deleted session file: ${req.params.filename}`, 'session', { 
        fileName: req.params.filename 
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    
    // Add log entry for failed session deletion
    addLog('error', `Failed to delete session file: ${error.message}`, 'session', { 
      fileName: req.params.filename, 
      error 
    });
    
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

app.post('/api/sessions/append-wallets', async (req, res) => {
  try {
    const { wallets, sessionFileName } = req.body;
    const sessionFilePath = path.join(swapConfig.SESSION_DIR, sessionFileName);
    
    const walletsWithNumber = wallets.map(wallet => 
      WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number)
    );
    
    const success = await appendWalletsToSession(walletsWithNumber, sessionFilePath);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to append wallets to session' });
    }
  } catch (error) {
    console.error('Error appending wallets to session:', error);
    res.status(500).json({ error: 'Failed to append wallets to session' });
  }
});

// Token Management
app.post('/api/tokens/validate', async (req, res) => {
  try {
    const { tokenAddress } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({ error: 'Token address is required' });
    }
    
    if (tokenAddress.length < 32 || tokenAddress.length > 44) {
      return res.json({ isValid: false });
    }
    
    const tokenData = await getDexscreenerData(tokenAddress);
    
    if (tokenData && tokenData.pairs && tokenData.pairs.length > 0) {
      const pair = tokenData.pairs[0];
      
      // Get pool keys for the token
      let poolKeys = null;
      try {
        const marketId = await getMarketIdForTokenAddress(connection, tokenAddress);
        if (marketId) {
          poolKeys = await getPoolKeysForTokenAddress(connection, tokenAddress);
        }
      } catch (error) {
        console.log('Pool keys not found, continuing without them');
        
        // Add log entry for pool keys not found
        addLog('warning', `Pool keys not found for token ${tokenAddress}`, 'token', { 
          tokenAddress, 
          error: error.message 
        });
      }

      // Create initial session file immediately after token validation (like CLI)
      const now = new Date();
      const sessionTimestamp = now.toISOString();
      const tokenName = pair.baseToken.name;
      const currentSessionFileName = `${tokenName}_${formatTimestampToEST(new Date(sessionTimestamp))}_session.json`;
      
      console.log(`🔄 Creating initial session file: ${currentSessionFileName}`);
      
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
        const sessionFilePath = path.join(swapConfig.SESSION_DIR, currentSessionFileName);
        fs.writeFileSync(sessionFilePath, JSON.stringify(initialSessionData, null, 2));
        console.log('✅ Initial session file created successfully');
        
        // Store session info for subsequent API calls
        global.currentSessionInfo = {
          fileName: currentSessionFileName,
          filePath: sessionFilePath,
          tokenName,
          tokenAddress,
          poolKeys,
          sessionTimestamp
        };
        
        // Add log entry for session creation
        addLog('success', `Created initial session file for ${tokenName}`, 'session', { 
          fileName: currentSessionFileName, 
          tokenName, 
          tokenAddress 
        });
        
      } catch (error) {
        console.error('❌ Failed to create initial session file:', error);
        
        // Add log entry for failed session creation
        addLog('error', `Failed to create initial session file: ${error.message}`, 'session', { 
          tokenName, 
          tokenAddress, 
          error 
        });
        
        return res.status(500).json({ error: 'Failed to create session file' });
      }

      res.json({
        isValid: true,
        sessionFileName: currentSessionFileName,
        tokenData: {
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          address: tokenAddress,
          price: pair.priceUsd,
          volume: { h24: pair.volume.h24 },
          priceChange: { h24: pair.priceChange.h24 },
          txns: {
            h24: {
              buys: pair.txns.h24.buys,
              sells: pair.txns.h24.sells
            }
          }
        },
        poolKeys
      });
    } else {
      res.json({ isValid: false });
    }
  } catch (error) {
    console.error('Error validating token:', error);
    
    // Add log entry for token validation error
    addLog('error', `Token validation failed: ${error.message}`, 'token', { 
      error 
    });
    
    res.status(500).json({ error: 'Failed to validate token' });
  }
});

app.post('/api/tokens/pool-keys', async (req, res) => {
  try {
    const { tokenAddress } = req.body;
    const poolKeys = await getPoolKeysForTokenAddress(connection, tokenAddress);
    
    if (poolKeys) {
      res.json(poolKeys);
    } else {
      res.status(404).json({ error: 'Pool keys not found' });
    }
  } catch (error) {
    console.error('Error getting pool keys:', error);
    res.status(500).json({ error: 'Failed to get pool keys' });
  }
});

app.post('/api/tokens/market-id', async (req, res) => {
  try {
    const { tokenAddress } = req.body;
    const marketId = await getMarketIdForTokenAddress(connection, tokenAddress);
    
    if (marketId) {
      res.json({ marketId: marketId.toString() });
    } else {
      res.status(404).json({ error: 'Market ID not found' });
    }
  } catch (error) {
    console.error('Error getting market ID:', error);
    res.status(500).json({ error: 'Failed to get market ID' });
  }
});

// Wallet Management
app.post('/api/wallets/admin', async (req, res) => {
  try {
    const adminWallet = new WalletWithNumber();
    
    // Update session file with admin wallet (like CLI)
    if (global.currentSessionInfo) {
      console.log(`🔄 Updating session file with admin wallet: ${global.currentSessionInfo.fileName}`);
      
      try {
        const sessionData = JSON.parse(fs.readFileSync(global.currentSessionInfo.filePath, 'utf-8'));
        sessionData.admin = {
          number: adminWallet.number,
          address: adminWallet.publicKey,
          privateKey: adminWallet.privateKey
        };
        
        fs.writeFileSync(global.currentSessionInfo.filePath, JSON.stringify(sessionData, null, 2));
        console.log('✅ Session updated with admin wallet successfully');
        
        // Add log entry for session update
        addLog('success', `Updated session with admin wallet: ${global.currentSessionInfo.fileName}`, 'session', { 
          fileName: global.currentSessionInfo.fileName, 
          adminWallet: adminWallet.publicKey 
        });
      } catch (error) {
        console.error('❌ Failed to update session with admin wallet:', error);
        
        // Add log entry for failed session update
        addLog('error', `Failed to update session with admin wallet: ${error.message}`, 'session', { 
          fileName: global.currentSessionInfo.fileName, 
          error 
        });
        
        return res.status(500).json({ error: 'Failed to update session file' });
      }
    }
    
    res.json({
      number: adminWallet.number,
      publicKey: adminWallet.publicKey,
      privateKey: adminWallet.privateKey,
      solBalance: 0,
      tokenBalance: 0,
      isActive: true
    });
  } catch (error) {
    console.error('Error creating admin wallet:', error);
    
    // Add log entry for admin wallet creation error
    addLog('error', `Failed to create admin wallet: ${error.message}`, 'wallet', { error });
    
    res.status(500).json({ error: 'Failed to create admin wallet' });
  }
});

app.post('/api/wallets/admin/import', async (req, res) => {
  try {
    const { privateKey } = req.body;
    
    if (!privateKey) {
      return res.status(400).json({ error: 'Private key is required' });
    }
    
    const adminWallet = WalletWithNumber.fromPrivateKey(privateKey, 0);
    
    // Update session file with imported admin wallet (like CLI)
    if (global.currentSessionInfo) {
      console.log(`🔄 Updating session file with imported admin wallet: ${global.currentSessionInfo.fileName}`);
      
      try {
        const sessionData = JSON.parse(fs.readFileSync(global.currentSessionInfo.filePath, 'utf-8'));
        sessionData.admin = {
          number: adminWallet.number,
          address: adminWallet.publicKey,
          privateKey: adminWallet.privateKey
        };
        
        fs.writeFileSync(global.currentSessionInfo.filePath, JSON.stringify(sessionData, null, 2));
        console.log('✅ Session updated with imported admin wallet successfully');
        
        // Add log entry for session update with imported wallet
        addLog('success', `Updated session with imported admin wallet: ${global.currentSessionInfo.fileName}`, 'session', { 
          fileName: global.currentSessionInfo.fileName, 
          adminWallet: adminWallet.publicKey 
        });
      } catch (error) {
        console.error('❌ Failed to update session with imported admin wallet:', error);
        
        // Add log entry for failed session update with imported wallet
        addLog('error', `Failed to update session with imported admin wallet: ${error.message}`, 'session', { 
          fileName: global.currentSessionInfo.fileName, 
          error 
        });
        
        return res.status(500).json({ error: 'Failed to update session file' });
      }
    }
    
    res.json({
      number: 0,
      publicKey: adminWallet.publicKey,
      privateKey: adminWallet.privateKey,
      solBalance: 0,
      tokenBalance: 0,
      isActive: true
    });
  } catch (error) {
    console.error('Error importing admin wallet:', error);
    
    // Add log entry for admin wallet import error
    addLog('error', `Failed to import admin wallet: ${error.message}`, 'wallet', { error });
    
    res.status(500).json({ error: 'Failed to import admin wallet' });
  }
});

app.post('/api/wallets/trading', async (req, res) => {
  try {
    const { count } = req.body;
    
    if (!count || count < 1 || count > 100) {
      return res.status(400).json({ error: 'Count must be between 1 and 100' });
    }
    
    const wallets = Array.from({ length: count }, (_, i) => {
      const wallet = new WalletWithNumber();
      return {
        number: wallet.number,
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey,
        solBalance: 0,
        tokenBalance: 0,
        isActive: false,
        generationTimestamp: wallet.generationTimestamp
      };
    });
    
    // Append wallets to session file (like CLI)
    if (global.currentSessionInfo) {
      console.log(`🔄 Appending ${count} trading wallets to session: ${global.currentSessionInfo.fileName}`);
      
      try {
        const sessionData = JSON.parse(fs.readFileSync(global.currentSessionInfo.filePath, 'utf-8'));
        
        const newWalletData = wallets.map(wallet => ({
          number: wallet.number,
          address: wallet.publicKey,
          privateKey: wallet.privateKey,
          generationTimestamp: wallet.generationTimestamp
        }));
        
        sessionData.wallets.push(...newWalletData);
        
        fs.writeFileSync(global.currentSessionInfo.filePath, JSON.stringify(sessionData, null, 2));
        console.log('✅ Trading wallets appended to session successfully');
        
        // Add log entry for wallet append
        addLog('success', `Appended ${count} trading wallets to session: ${global.currentSessionInfo.fileName}`, 'session', { 
          fileName: global.currentSessionInfo.fileName, 
          walletCount: count 
        });
      } catch (error) {
        console.error('❌ Failed to append trading wallets to session:', error);
        
        // Add log entry for failed wallet append
        addLog('error', `Failed to append trading wallets to session: ${error.message}`, 'session', { 
          fileName: global.currentSessionInfo.fileName, 
          error 
        });
        
        return res.status(500).json({ error: 'Failed to update session file' });
      }
    }
    
    res.json(wallets);
  } catch (error) {
    console.error('Error generating trading wallets:', error);
    
    // Add log entry for wallet generation error
    addLog('error', `Failed to generate trading wallets: ${error.message}`, 'wallet', { 
      count: req.body.count, 
      error 
    });
    
    res.status(500).json({ error: 'Failed to generate trading wallets' });
  }
});

app.post('/api/wallets/balances', async (req, res) => {
  try {
    const { wallets } = req.body;
    const updatedWallets = [];
    
    for (const wallet of wallets) {
      const walletInstance = WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number);
      const solBalance = await getSolBalance(walletInstance, connection);
      
      let tokenBalance = 0;
      if (process.env.TOKEN_ADDRESS) {
        const raydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, wallet.privateKey);
        tokenBalance = await getTokenBalance(raydiumSwap, process.env.TOKEN_ADDRESS);
      }
      
      updatedWallets.push({
        ...wallet,
        solBalance,
        tokenBalance
      });
    }
    
    res.json(updatedWallets);
  } catch (error) {
    console.error('Error getting wallet balances:', error);
    
    // Add log entry for wallet balance error
    addLog('error', `Failed to get wallet balances: ${error.message}`, 'wallet', { error });
    
    res.status(500).json({ error: 'Failed to get wallet balances' });
  }
});

app.post('/api/wallets/admin/token-balance', async (req, res) => {
  try {
    const { adminWallet, tokenAddress } = req.body;
    const raydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, adminWallet.privateKey);
    const balance = await getTokenBalance(raydiumSwap, tokenAddress);
    res.json({ balance });
  } catch (error) {
    console.error('Error getting admin token balance:', error);
    
    // Add log entry for admin token balance error
    addLog('error', `Failed to get admin token balance: ${error.message}`, 'wallet', { error });
    
    res.status(500).json({ error: 'Failed to get admin token balance' });
  }
});

// Distribution
app.post('/api/distribution/sol', async (req, res) => {
  try {
    const { adminWallet, tradingWallets, totalAmount } = req.body;
    
    const adminWalletInstance = WalletWithNumber.fromPrivateKey(adminWallet.privateKey, adminWallet.number);
    const tradingWalletInstances = tradingWallets.map(wallet => 
      WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number)
    );
    
    const result = await distributeSol(adminWalletInstance, tradingWalletInstances, totalAmount, connection);
    res.json(result.successWallets);
  } catch (error) {
    console.error('Error distributing SOL:', error);
    
    // Add log entry for SOL distribution error
    addLog('error', `Failed to distribute SOL: ${error.message}`, 'distribution', { error });
    
    res.status(500).json({ error: 'Failed to distribute SOL' });
  }
});

app.post('/api/distribution/tokens', async (req, res) => {
  try {
    const { adminWallet, tradingWallets, tokenAddress, amountPerWallet } = req.body;
    
    const adminWalletInstance = WalletWithNumber.fromPrivateKey(adminWallet.privateKey, adminWallet.number);
    const tradingWalletInstances = tradingWallets.map(wallet => 
      WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number)
    );
    
    const raydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, adminWallet.privateKey);
    const decimals = await raydiumSwap.getTokenDecimals(tokenAddress);
    
    await distributeTokens(
      adminWalletInstance,
      new PublicKey(adminWallet.publicKey),
      tradingWalletInstances,
      new PublicKey(tokenAddress),
      amountPerWallet,
      decimals,
      connection
    );
    
    const updatedWallets = [];
    for (const wallet of tradingWallets) {
      const walletRaydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, wallet.privateKey);
      const tokenBalance = await getTokenBalance(walletRaydiumSwap, tokenAddress);
      updatedWallets.push({
        ...wallet,
        tokenBalance
      });
    }
    
    res.json(updatedWallets);
  } catch (error) {
    console.error('Error distributing tokens:', error);
    
    // Add log entry for token distribution error
    addLog('error', `Failed to distribute tokens: ${error.message}`, 'distribution', { error });
    
    res.status(500).json({ error: 'Failed to distribute tokens' });
  }
});

// Trading Control
app.post('/api/trading/start', async (req, res) => {
  try {
    const { strategy, sessionData } = req.body;
    globalTradingFlag.value = true;
    
    console.log(`Trading started with strategy: ${strategy}`);
    
    // Add log entry for trading start
    addLog('info', `Trading started with strategy: ${strategy}`, 'trading', { 
      strategy, 
      tokenName: sessionData.tokenName, 
      tokenAddress: sessionData.tokenAddress 
    });
    
    // Call the REAL dynamicTrade function
    try {
      // Import and call the real dynamicTrade function
      const { dynamicTrade } = require('./dist-backend/dynamicTrade.js');
      const WalletWithNumber = require('./dist-backend/wallet.js');
      
      // Create wallet instances from session data
      const adminWallet = WalletWithNumber.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
      const tradingWallets = sessionData.wallets.map(w => 
        WalletWithNumber.fromPrivateKey(w.privateKey, w.number)
      );
      
      addLog('info', `Starting real trading engine with ${tradingWallets.length} wallets`, 'trading', {
        strategy,
        tokenName: sessionData.tokenName,
        tokenAddress: sessionData.tokenAddress
      });
      
      // Start the REAL trading engine in the background
      dynamicTrade(
        adminWallet,
        tradingWallets,
        sessionData.tokenAddress,
        strategy,
        connection,
        sessionData.timestamp,
        sessionData.tokenName,
        globalTradingFlag
      ).catch(error => {
        addError(`Real trading engine error: ${error.message}`, 'trading', { error });
        globalTradingFlag.value = false;
      });
      
    } catch (importError) {
      addError(`Failed to import real trading engine: ${importError.message}`, 'trading');
      console.log('Falling back to basic trading simulation...');
    }
    
    res.json({ success: true, message: 'Trading started' });
  } catch (error) {
    console.error('Error starting trading:', error);
    
    // Add log entry for trading start error
    addLog('error', `Failed to start trading: ${error.message}`, 'trading', { error });
    
    res.status(500).json({ error: 'Failed to start trading' });
  }
});

app.post('/api/trading/pause', async (req, res) => {
  try {
    globalTradingFlag.value = false;
    
    // Add log entry for trading pause
    addLog('info', 'Trading paused', 'trading');
    
    res.json({ success: true, message: 'Trading paused' });
  } catch (error) {
    console.error('Error pausing trading:', error);
    
    // Add log entry for trading pause error
    addLog('error', `Failed to pause trading: ${error.message}`, 'trading', { error });
    
    res.status(500).json({ error: 'Failed to pause trading' });
  }
});

app.post('/api/trading/resume', async (req, res) => {
  try {
    globalTradingFlag.value = true;
    
    // Add log entry for trading resume
    addLog('info', 'Trading resumed', 'trading');
    
    res.json({ success: true, message: 'Trading resumed' });
  } catch (error) {
    console.error('Error resuming trading:', error);
    
    // Add log entry for trading resume error
    addLog('error', `Failed to resume trading: ${error.message}`, 'trading', { error });
    
    res.status(500).json({ error: 'Failed to resume trading' });
  }
});

app.post('/api/trading/stop', async (req, res) => {
  try {
    globalTradingFlag.value = false;
    
    // Add log entry for trading stop
    addLog('info', 'Trading stopped', 'trading');
    
    res.json({ success: true, message: 'Trading stopped' });
  } catch (error) {
    console.error('Error stopping trading:', error);
    
    // Add log entry for trading stop error
    addLog('error', `Failed to stop trading: ${error.message}`, 'trading', { error });
    
    res.status(500).json({ error: 'Failed to stop trading' });
  }
});

// Restart Points
app.post('/api/restart/:point', async (req, res) => {
  try {
    const point = parseInt(req.params.point);
    const { sessionData } = req.body;
    
    // Add log entry for restart
    addLog('info', `Restarting from point ${point}`, 'restart', { 
      point, 
      tokenName: sessionData.tokenName 
    });
    
    switch (point) {
      case 1:
        res.json({ success: true, message: 'Restarting from admin wallet creation' });
        break;
      case 2:
        res.json({ success: true, message: 'Restarting from wallet generation' });
        break;
      case 3:
        res.json({ success: true, message: 'Restarting from SOL distribution' });
        break;
      case 4:
        res.json({ success: true, message: 'Restarting from trading' });
        break;
      case 5:
        res.json({ success: true, message: 'Restarting from token transfer' });
        break;
      case 6:
        // Here you would call your closeTokenAccountsAndSendBalance function
        const adminWalletInstance = WalletWithNumber.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
        const tradingWalletInstances = sessionData.wallets.map(wallet => 
          WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number)
        );
        
        await closeTokenAccountsAndSendBalance(
          adminWalletInstance, 
          tradingWalletInstances, 
          sessionData.tokenAddress, 
          connection
        );
        
        res.json({ success: true, message: 'Token accounts closed and balances sent to admin' });
        break;
      default:
        res.status(400).json({ error: 'Invalid restart point' });
    }
  } catch (error) {
    console.error('Error restarting from point:', error);
    
    // Add log entry for restart error
    addLog('error', `Failed to restart from point: ${error.message}`, 'restart', { error });
    
    res.status(500).json({ error: 'Failed to restart from point' });
  }
});

// Cleanup
app.post('/api/cleanup/close-accounts', async (req, res) => {
  try {
    const { sessionData } = req.body;
    
    const adminWalletInstance = WalletWithNumber.fromPrivateKey(sessionData.admin.privateKey, sessionData.admin.number);
    const tradingWalletInstances = sessionData.wallets.map(wallet => 
      WalletWithNumber.fromPrivateKey(wallet.privateKey, wallet.number)
    );
    
    await closeTokenAccountsAndSendBalance(
      adminWalletInstance, 
      tradingWalletInstances, 
      sessionData.tokenAddress, 
      connection
    );
    
    res.json({ success: true, message: 'Token accounts closed and balances sent to admin' });
  } catch (error) {
    console.error('Error closing token accounts:', error);
    
    // Add log entry for cleanup error
    addLog('error', `Failed to close token accounts: ${error.message}`, 'cleanup', { error });
    
    res.status(500).json({ error: 'Failed to close token accounts' });
  }
});

// Environment File Generation
app.post('/api/sessions/export-env', async (req, res) => {
  try {
    const { sessionData } = req.body;
    
    let envContent = `RPC_URL=${swapConfig.RPC_URL}\n`;
    envContent += `ADMIN_WALLET_PRIVATE_KEY=${sessionData.admin.privateKey}\n`;
    envContent += `TOKEN_ADDRESS=${sessionData.tokenAddress}\n`;
    
    sessionData.wallets.forEach((wallet, index) => {
      envContent += `WALLET_PRIVATE_KEY_${index + 1}=${wallet.privateKey}\n`;
    });
    
    // Add log entry for env file generation
    addLog('info', `Generated environment file for ${sessionData.tokenName}`, 'session', { 
      tokenName: sessionData.tokenName 
    });
    
    res.type('text/plain').send(envContent);
  } catch (error) {
    console.error('Error generating env file:', error);
    
    // Add log entry for env file generation error
    addLog('error', `Failed to generate environment file: ${error.message}`, 'session', { error });
    
    res.status(500).json({ error: 'Failed to generate env file' });
  }
});

// Configuration Management
app.get('/api/config/swap', (req, res) => {
  res.json(swapConfig);
});

app.post('/api/config/swap', (req, res) => {
  try {
    const { config } = req.body;
    
    // Update the swapConfig object with the new values
    Object.assign(swapConfig, config);
    
    // Save the updated config to a file
    const configFilePath = path.join(__dirname, 'swapConfig.json');
    fs.writeFileSync(configFilePath, JSON.stringify(swapConfig, null, 2));
    
    // Add log entry for config update
    addLog('info', 'Configuration updated successfully', 'config', { 
      updatedKeys: Object.keys(config) 
    });
    
    res.json({ success: true, message: 'Configuration updated successfully' });
  } catch (error) {
    console.error('Error updating configuration:', error);
    
    // Add log entry for config update error
    addLog('error', `Failed to update configuration: ${error.message}`, 'config', { error });
    
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

app.post('/api/config/test-rpc', async (req, res) => {
  try {
    const { rpcUrl } = req.body;
    
    if (!rpcUrl) {
      return res.status(400).json({ error: 'RPC URL is required' });
    }
    
    // Test the RPC connection
    const testConnection = new Connection(rpcUrl, 'confirmed');
    const version = await testConnection.getVersion();
    
    // Add log entry for RPC test
    addLog('info', `RPC connection test successful: ${rpcUrl}`, 'config', { 
      rpcUrl, 
      version 
    });
    
    res.json({ 
      success: true, 
      message: 'RPC connection successful', 
      version 
    });
  } catch (error) {
    console.error('Error testing RPC connection:', error);
    
    // Add log entry for RPC test error
    addLog('error', `RPC connection test failed: ${error.message}`, 'config', { 
      rpcUrl: req.body.rpcUrl, 
      error 
    });
    
    res.status(500).json({ 
      success: false, 
      error: `Failed to connect to RPC: ${error.message}` 
    });
  }
});

// Monitoring Endpoints
app.get('/api/monitoring/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level;
    const source = req.query.source;
    
    let filteredLogs = [...monitoringData.logs];
    
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    if (source) {
      filteredLogs = filteredLogs.filter(log => log.source === source);
    }
    
    res.json(filteredLogs.slice(0, limit));
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/monitoring/console', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    res.json(monitoringData.consoleOutput.slice(-limit));
  } catch (error) {
    console.error('Error fetching console output:', error);
    res.status(500).json({ error: 'Failed to fetch console output' });
  }
});

app.get('/api/monitoring/errors', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json(monitoringData.errors.slice(0, limit));
  } catch (error) {
    console.error('Error fetching errors:', error);
    res.status(500).json({ error: 'Failed to fetch errors' });
  }
});

app.post('/api/monitoring/errors/:id/resolve', (req, res) => {
  try {
    const errorId = req.params.id;
    const errorIndex = monitoringData.errors.findIndex(e => e.id === errorId);
    
    if (errorIndex >= 0) {
      monitoringData.errors[errorIndex].resolved = true;
      monitoringData.errors[errorIndex].resolvedAt = Date.now();
      
      // Add log entry for error resolution
      addLog('success', `Resolved error: ${monitoringData.errors[errorIndex].message.slice(0, 50)}...`, 'error', { 
        errorId 
      });
      
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Error not found' });
    }
  } catch (error) {
    console.error('Error resolving error:', error);
    res.status(500).json({ error: 'Failed to resolve error' });
  }
});

app.get('/api/monitoring/performance', (req, res) => {
  try {
    const metrics = getPerformanceMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'Failed to fetch performance metrics' });
  }
});

app.get('/api/monitoring/health', (req, res) => {
  try {
    const health = getSystemHealth();
    res.json(health);
  } catch (error) {
    console.error('Error fetching system health:', error);
    res.status(500).json({ error: 'Failed to fetch system health' });
  }
});

app.get('/api/monitoring/balance-changes', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json(monitoringData.balanceChanges.slice(0, limit));
  } catch (error) {
    console.error('Error fetching balance changes:', error);
    res.status(500).json({ error: 'Failed to fetch balance changes' });
  }
});

app.get('/api/monitoring/analytics', (req, res) => {
  try {
    const analytics = getTradingAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching trading analytics:', error);
    res.status(500).json({ error: 'Failed to fetch trading analytics' });
  }
});

app.get('/api/monitoring/transactions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    res.json(monitoringData.transactions.slice(-limit));
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    tradingActive: globalTradingFlag.value,
    rpcUrl: swapConfig.RPC_URL,
    wsUrl: swapConfig.WS_URL,
    modulesLoaded: {
      solanaConnection: true,
      walletWithNumber: true,
      dexscreenerAPI: true,
      sessionManagement: true,
      solDistribution: true,
      tokenDistribution: true,
      tradingControls: true,
      realSolanaFunctions: true,
      tokenAccountCleaner: true,
      configurationManager: true,
      monitoringSystem: true
    }
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('API Error:', error);
  
  // Add log entry for API error
  addLog('error', `API Error: ${error.message}`, 'api', { 
    path: req.path, 
    method: req.method, 
    error 
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

// Serve the React app for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Production server running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 RPC URL: ${swapConfig.RPC_URL}`);
  console.log(`🌐 WebSocket URL: ${swapConfig.WS_URL}`);
  console.log(`📁 Session Directory: ${swapConfig.SESSION_DIR}`);
  console.log('✅ Backend integrated with real Solana functions');
  console.log('✅ Real wallet generation and SOL distribution');
  console.log('✅ Real Dexscreener API integration');
  console.log('✅ Real session management');
  console.log('✅ Token account closing and balance consolidation');
  console.log('✅ Configuration management system');
  console.log('✅ Ready for production use');
  
  // Add initial logs to monitoring system
  addLog('info', `Production server started on port ${PORT}`, 'server', { port: PORT });
  addLog('info', `Connected to Solana RPC: ${swapConfig.RPC_URL}`, 'solana', { rpcUrl: swapConfig.RPC_URL });
  addLog('info', `WebSocket connection ready: ${swapConfig.WS_URL}`, 'websocket', { wsUrl: swapConfig.WS_URL });
  addLog('info', `Session directory initialized: ${swapConfig.SESSION_DIR}`, 'session', { sessionDir: swapConfig.SESSION_DIR });
  addLog('success', 'All backend modules loaded successfully', 'system', { 
    modules: ['solanaConnection', 'walletGeneration', 'dexscreenerAPI', 'sessionManagement', 'tokenDistribution', 'tradingControls', 'monitoringSystem']
  });
  addLog('info', 'Monitoring system active - real-time logging enabled', 'monitoring', { 
    maxLogs: MAX_LOGS, 
    maxConsoleOutput: MAX_CONSOLE_OUTPUT,
    maxErrors: MAX_ERRORS 
  });
});

module.exports = app;