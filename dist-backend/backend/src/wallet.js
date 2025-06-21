"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const chalk_1 = __importDefault(require("chalk"));
class WalletWithNumber {
    constructor() {
        console.log(chalk_1.default.white(`Generating wallet instance. Counter: ${WalletWithNumber.counter}`));
        this.keypair = web3_js_1.Keypair.generate();
        this.number = WalletWithNumber.counter++;
        this.privateKey = bs58_1.default.encode(this.keypair.secretKey);
        console.log(chalk_1.default.bgBlueBright(`Generated Wallet ${this.number}: publicKey=${chalk_1.default.white(this.publicKey)}, privateKey=${chalk_1.default.white(this.privateKey)}`));
    }
    static fromPrivateKey(privateKey, number) {
        const keypair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(privateKey));
        const wallet = Object.create(WalletWithNumber.prototype);
        wallet.keypair = keypair;
        wallet.privateKey = privateKey;
        wallet.number = number;
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
exports.default = WalletWithNumber;
//# sourceMappingURL=wallet.js.map