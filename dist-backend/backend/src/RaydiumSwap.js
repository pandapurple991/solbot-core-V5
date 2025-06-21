"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const anchor_1 = require("@coral-xyz/anchor");
const bs58_1 = __importDefault(require("bs58"));
class RaydiumSwap {
    constructor(RPC_URL, WALLET_PRIVATE_KEY) {
        this.tokenDecimals = {};
        this.connection = new web3_js_1.Connection(RPC_URL, { commitment: 'confirmed' });
        this.wallet = new anchor_1.Wallet(web3_js_1.Keypair.fromSecretKey(Uint8Array.from(bs58_1.default.decode(WALLET_PRIVATE_KEY))));
    }
    async getOwnerTokenAccounts() {
        const walletTokenAccount = await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
            programId: raydium_sdk_1.TOKEN_PROGRAM_ID,
        });
        return walletTokenAccount.value.map((i) => ({
            pubkey: i.pubkey,
            programId: i.account.owner,
            accountInfo: raydium_sdk_1.SPL_ACCOUNT_LAYOUT.decode(i.account.data),
        }));
    }
    async getTokenDecimals(mintAddress) {
        if (this.tokenDecimals[mintAddress] === undefined) {
            const tokenInfo = await this.connection.getParsedAccountInfo(new web3_js_1.PublicKey(mintAddress));
            if (tokenInfo.value && 'parsed' in tokenInfo.value.data) {
                const decimals = tokenInfo.value.data.parsed.info.decimals;
                if (decimals !== undefined) {
                    this.tokenDecimals[mintAddress] = decimals;
                }
                else {
                    throw new Error(`Unable to fetch token decimals for ${mintAddress}`);
                }
            }
            else {
                throw new Error(`Unable to parse token account info for ${mintAddress}`);
            }
        }
        return this.tokenDecimals[mintAddress];
    }
    async getSwapTransaction(toToken, amount, poolKeys, maxLamports = 100000, fixedSide = 'in') {
        const directionIn = poolKeys.quoteMint.toString() == toToken;
        const { minAmountOut, amountIn } = await this.calcAmountOut(poolKeys, amount, directionIn);
        const userTokenAccounts = await this.getOwnerTokenAccounts();
        const swapTransaction = await raydium_sdk_1.Liquidity.makeSwapInstructionSimple({
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
        const versionedTransaction = new web3_js_1.VersionedTransaction(new web3_js_1.TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash: recentBlockhashForSwap.blockhash,
            instructions: instructions,
        }).compileToV0Message());
        versionedTransaction.sign([this.wallet.payer]);
        return versionedTransaction;
    }
    async sendVersionedTransaction(tx, maxRetries) {
        const recentBlockhash = await this.connection.getLatestBlockhash();
        tx.message.recentBlockhash = recentBlockhash.blockhash;
        const txid = await this.connection.sendTransaction(tx, {
            skipPreflight: true,
            maxRetries: maxRetries,
        });
        return txid;
    }
    async calcAmountOut(poolKeys, rawAmountIn, swapInDirection) {
        const poolInfo = await raydium_sdk_1.Liquidity.fetchInfo({ connection: this.connection, poolKeys });
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
        const currencyIn = new raydium_sdk_1.Token(raydium_sdk_1.TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals);
        const amountIn = new raydium_sdk_1.TokenAmount(currencyIn, rawAmountIn, false);
        const currencyOut = new raydium_sdk_1.Token(raydium_sdk_1.TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals);
        const slippage = new raydium_sdk_1.Percent(25, 100); // 5% slippage
        const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = raydium_sdk_1.Liquidity.computeAmountOut({
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
exports.default = RaydiumSwap;
//# sourceMappingURL=RaydiumSwap.js.map