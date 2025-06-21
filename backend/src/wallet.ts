import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import chalk from 'chalk';

class WalletWithNumber {
  private static counter = 0;
  public keypair: Keypair;
  public number: number;
  public privateKey: string;
  public generationTimestamp?: string; // Add the generationTimestamp property

  constructor() {
    console.log(chalk.white(`Generating wallet instance. Counter: ${WalletWithNumber.counter}`));
    this.keypair = Keypair.generate();
    this.number = WalletWithNumber.counter++;
    this.privateKey = bs58.encode(this.keypair.secretKey);
    console.log(chalk.bgBlueBright(`Generated Wallet ${this.number}: publicKey=${chalk.white(this.publicKey)}, privateKey=${chalk.white(this.privateKey)}`));
  }


  public static fromPrivateKey(privateKey: string, number: number): WalletWithNumber {
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const wallet = Object.create(WalletWithNumber.prototype) as WalletWithNumber;
    wallet.keypair = keypair;
    wallet.privateKey = privateKey;
    wallet.number = number;
    return wallet;
  }

  public get publicKey(): string {
    return this.keypair.publicKey.toBase58();
  }

  public get secretKeyBase58(): string {
    return this.privateKey;
  }
}

export default WalletWithNumber;
