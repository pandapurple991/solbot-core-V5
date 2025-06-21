export const swapConfig = {
  RPC_URL: "https://floral-capable-sun.solana-mainnet.quiknode.pro/569466c8ec8e71909ae64117473d0bd3327e133a/",
  WS_URL: "wss://floral-capable-sun.solana-mainnet.quiknode.pro/569466c8ec8e71909ae64117473d0bd3327e133a/",
  
  // Addresses
  WSOL_ADDRESS: "So11111111111111111111111111111111111111112", // WSOL address
  RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium liquidity pool address

  // Swap Configuration
  SLIPPAGE_PERCENT: 5, // Slippage percentage for swaps
  initialAmount: 0.00001, // Initial amount of SOL to swap
  TOKEN_TRANSFER_THRESHOLD: 0,

  // Retry Configuration
  poolSearchMaxRetries: 10, // Maximum number of retries for pool search
  poolSearchRetryInterval: 2000, // Retry interval for pool search in milliseconds
  retryInterval: 1000, // Time interval in milliseconds for retrying failed transactions
  maxRetries: 15, // Maximum retries for sending transactions

  // Fees and Limits
  RENT_EXEMPT_FEE: 900000, // Rent exempt fee for token accounts
  maxLamports: 6000, // Maximum lamports for transaction

  // Trading Durations
  TRADE_DURATION_VOLUME: 1200000000, // Duration for time-limited strategies (e.g., 5 minutes)
  TRADE_DURATION_MAKER: 181000, // Duration for time-limited strategies (e.g., 1 minute)
  loopInterval: 8000, // Loop interval in milliseconds
  RENT_EXEMPT_SWAP_FEE: 0, // Rent exempt fee for swap transactions
  
  // Percentage Configuration
  minPercentage: 5, // Minimum percentage for buy amounts
  maxPercentage: 15, // Maximum percentage for buy amounts
  minSellPercentage: 50, // Minimum percentage for sell amounts
  maxSellPercentage: 100, // Maximum percentage for sell amounts
  buyDuration: 61000, // Time in milliseconds (e.g., 60,000 ms = 1 minute)
  sellDuration: 30000, // Time in milliseconds (e.g., 60,000 ms = 1 minute)
  
  // Session Configuration
  SESSION_DIR: "./sessions" // Directory to save session data
};