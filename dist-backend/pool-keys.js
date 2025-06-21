"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketIdForTokenAddress = getMarketIdForTokenAddress;
exports.getPoolKeysForTokenAddress = getPoolKeysForTokenAddress;
const openbook_1 = require("@openbook-dex/openbook");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const web3_js_1 = require("@solana/web3.js");
const swapConfig_1 = require("./swapConfig");
async function getMarketIdForTokenAddress(connection, tokenaddress) {
    const poolid = await getPoolID(tokenaddress, connection);
    if (poolid) {
        return await getMarketIdFromPool(poolid, connection);
    }
    return null;
}
async function getPoolKeysForTokenAddress(connection, tokenaddress) {
    let foundMarketId = null;
    const poolid = await getPoolID(tokenaddress, connection);
    if (poolid) {
        foundMarketId = await getMarketIdFromPool(poolid, connection);
    }
    if (foundMarketId != null) {
        const { decoded } = await openbook_1.Market.load(connection, foundMarketId, { commitment: "confirmed", skipPreflight: true }, raydium_sdk_1.MAINNET_PROGRAM_ID.OPENBOOK_MARKET);
        const { baseVault, quoteVault, bids, asks, eventQueue, } = decoded;
        const poolKeys = raydium_sdk_1.Liquidity.getAssociatedPoolKeys({
            version: 4,
            marketVersion: 3,
            marketId: foundMarketId,
            baseMint: new web3_js_1.PublicKey(tokenaddress),
            quoteMint: new web3_js_1.PublicKey('So11111111111111111111111111111111111111112'),
            baseDecimals: 9,
            quoteDecimals: 9,
            programId: raydium_sdk_1.MAINNET_PROGRAM_ID.AmmV4,
            marketProgramId: raydium_sdk_1.MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
        });
        const liquidityPoolKeys = {
            ...poolKeys,
            marketAsks: asks,
            marketBids: bids,
            marketEventQueue: eventQueue,
            marketQuoteVault: quoteVault,
            marketBaseVault: baseVault,
        };
        return liquidityPoolKeys;
    }
    return null;
}
async function getPoolID(tokenaddress, connection) {
    let base = new web3_js_1.PublicKey(tokenaddress);
    const quote = new web3_js_1.PublicKey(swapConfig_1.swapConfig.WSOL_ADDRESS);
    const commitment = "confirmed";
    try {
        const baseAccounts = await connection.getProgramAccounts(new web3_js_1.PublicKey(swapConfig_1.swapConfig.RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS), {
            commitment,
            filters: [
                { dataSize: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.span },
                {
                    memcmp: {
                        offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
                        bytes: base.toBase58(),
                    },
                },
                {
                    memcmp: {
                        offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
                        bytes: quote.toBase58(),
                    },
                },
            ],
        });
        if (baseAccounts.length > 0) {
            const { pubkey } = baseAccounts[0];
            return pubkey.toString();
        }
        const quoteAccounts = await connection.getProgramAccounts(new web3_js_1.PublicKey(swapConfig_1.swapConfig.RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS), {
            commitment,
            filters: [
                { dataSize: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.span },
                {
                    memcmp: {
                        offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
                        bytes: quote.toBase58(),
                    },
                },
                {
                    memcmp: {
                        offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
                        bytes: base.toBase58(),
                    },
                },
            ],
        });
        if (quoteAccounts.length > 0) {
            const { pubkey } = quoteAccounts[0];
            return pubkey.toString();
        }
        return null;
    }
    catch (error) {
        console.error("Error fetching Market accounts:", error);
        return null;
    }
}
async function getMarketIdFromPool(poolId, connection) {
    const version = 4;
    const account = await connection.getAccountInfo(new web3_js_1.PublicKey(poolId));
    const { state: LiquidityStateLayout } = raydium_sdk_1.Liquidity.getLayouts(version);
    const poolState = account?.data ? LiquidityStateLayout.decode(account.data) : null;
    return poolState ? poolState.marketId : null;
}
//# sourceMappingURL=pool-keys.js.map