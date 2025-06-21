import {
  Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage
} from '@solana/web3.js';
import {
  Liquidity, LiquidityPoolKeys, TokenAccount, Token, TokenAmount, TOKEN_PROGRAM_ID, Percent, SPL_ACCOUNT_LAYOUT
} from '@raydium-io/raydium-sdk';
import { Wallet } from '@coral-xyz/anchor';
import bs58 from 'bs58';

class RaydiumSwap {
  connection: Connection;
  wallet: Wallet;
  tokenDecimals: { [key: string]: number } = {};

  constructor(RPC_URL: string, WALLET_PRIVATE_KEY: string) {
    this.connection = new Connection(RPC_URL, { commitment: 'confirmed' });
    this.wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(WALLET_PRIVATE_KEY))));
  }

  async getOwnerTokenAccounts(): Promise<TokenAccount[]> {
    const walletTokenAccount = await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
      programId: TOKEN_PROGRAM_ID,
    });

    return walletTokenAccount.value.map((i) => ({
      pubkey: i.pubkey,
      programId: i.account.owner,
      accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    })) as TokenAccount[];
  }

  async getTokenDecimals(mintAddress: string): Promise<number> {
    if (this.tokenDecimals[mintAddress] === undefined) {
      const tokenInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintAddress));
      if (tokenInfo.value && 'parsed' in tokenInfo.value.data) {
        const decimals = tokenInfo.value.data.parsed.info.decimals;
        if (decimals !== undefined) {
          this.tokenDecimals[mintAddress] = decimals;
        } else {
          throw new Error(`Unable to fetch token decimals for ${mintAddress}`);
        }
      } else {
        throw new Error(`Unable to parse token account info for ${mintAddress}`);
      }
    }
    return this.tokenDecimals[mintAddress];
  }

  async getSwapTransaction(
    toToken: string,
    amount: number,
    poolKeys: LiquidityPoolKeys,
    maxLamports: number = 100000,
    fixedSide: 'in' | 'out' = 'in'
  ): Promise<VersionedTransaction> {
    const directionIn = poolKeys.quoteMint.toString() == toToken;
    const { minAmountOut, amountIn } = await this.calcAmountOut(poolKeys, amount, directionIn);
    const userTokenAccounts = await this.getOwnerTokenAccounts();
    const swapTransaction = await Liquidity.makeSwapInstructionSimple({
      connection: this.connection,
      makeTxVersion: 0,
      poolKeys: { ...poolKeys },
      userKeys: {
        tokenAccounts: userTokenAccounts,
        owner: this.wallet.publicKey,
      },
      amountIn: amountIn,
      amountOut: minAmountOut,
      fixedSide: fixedSide,
      config: {
        bypassAssociatedCheck: false,
      },
      computeBudgetConfig: {
        microLamports: maxLamports,
      },
    });

    const recentBlockhashForSwap = await this.connection.getLatestBlockhash();
    const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean);

    const versionedTransaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: this.wallet.publicKey,
        recentBlockhash: recentBlockhashForSwap.blockhash,
        instructions: instructions,
      }).compileToV0Message()
    );

    versionedTransaction.sign([this.wallet.payer]);

    return versionedTransaction;
  }

  async sendVersionedTransaction(tx: VersionedTransaction, maxRetries?: number) {
    const recentBlockhash = await this.connection.getLatestBlockhash();
    tx.message.recentBlockhash = recentBlockhash.blockhash;

    const txid = await this.connection.sendTransaction(tx, {
      skipPreflight: true,
      maxRetries: maxRetries,
    });

    return txid;
  }

  async calcAmountOut(poolKeys: LiquidityPoolKeys, rawAmountIn: number, swapInDirection: boolean) {
    const poolInfo = await Liquidity.fetchInfo({ connection: this.connection, poolKeys });

    let currencyInMint = poolKeys.baseMint;
    let currencyInDecimals = poolInfo.baseDecimals;
    let currencyOutMint = poolKeys.quoteMint;
    let currencyOutDecimals = poolInfo.quoteDecimals;

    if (!swapInDirection) {
      currencyInMint = poolKeys.quoteMint;
      currencyInDecimals = poolInfo.quoteDecimals;
      currencyOutMint = poolKeys.baseMint;
      currencyOutDecimals = poolInfo.baseDecimals;
    }

    const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals);
    const amountIn = new TokenAmount(currencyIn, rawAmountIn, false);
    const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals);
    const slippage = new Percent(25, 100); // 5% slippage

    const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut,
      slippage,
    });

    return {
      amountIn,
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee,
    };
  }

  async getBalance() {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / Math.pow(10, 9); // Convert lamports to SOL
  }
}

export default RaydiumSwap;
