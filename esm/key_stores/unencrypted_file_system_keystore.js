import fs from 'fs';
import path from 'path';
import { promisify as _promisify } from 'es6-promisify';
import { KeyPair } from '../utils/key_pair';
import { KeyStore } from './keystore';
const promisify = (fn) => {
    if (!fn) {
        return () => {
            throw new Error('Trying to use unimplemented function. `fs` module not available in web build?');
        };
    }
    return _promisify(fn);
};
const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
/** @hidden */
export async function loadJsonFile(filename) {
    const content = await readFile(filename);
    return JSON.parse(content.toString());
}
async function ensureDir(dir) {
    try {
        await mkdir(dir, { recursive: true });
    }
    catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
}
/** @hidden */
export async function readKeyFile(filename) {
    const accountInfo = await loadJsonFile(filename);
    // The private key might be in private_key or secret_key field.
    let privateKey = accountInfo.private_key;
    if (!privateKey && accountInfo.secret_key) {
        privateKey = accountInfo.secret_key;
    }
    return [accountInfo.account_id, KeyPair.fromString(privateKey)];
}
/**
 * This module contains the {@link UnencryptedFileSystemKeyStore} class which is used to store keys on the file system.
 *
 * @example {@link https://docs.near.org/docs/develop/front-end/naj-quick-reference#key-store}
 * @example
 * ```js
 * const { homedir } = require('os');
 * const { connect, keyStores } = require('near-api-js');
 *
 * const keyStore = new keyStores.UnencryptedFileSystemKeyStore(`${homedir()}/.near-credentials`);
 * const config = {
 *   keyStore, // instance of UnencryptedFileSystemKeyStore
 *   networkId: 'testnet',
 *   nodeUrl: 'https://rpc.testnet.near.org',
 *   walletUrl: 'https://wallet.testnet.near.org',
 *   helperUrl: 'https://helper.testnet.near.org',
 *   explorerUrl: 'https://explorer.testnet.near.org'
 * };
 *
 * // inside an async function
 * const near = await connect(config)
 * ```
 */
export class UnencryptedFileSystemKeyStore extends KeyStore {
    /**
     * @param keyDir base directory for key storage. Keys will be stored in `keyDir/networkId/accountId.json`
     */
    constructor(keyDir) {
        super();
        this.keyDir = path.resolve(keyDir);
    }
    /**
     * Store a {@link KeyPair} in an unencrypted file
     * @param networkId The targeted network. (ex. default, betanet, etc…)
     * @param accountId The NEAR account tied to the key pair
     * @param keyPair The key pair to store in local storage
     */
    async setKey(networkId, accountId, keyPair) {
        await ensureDir(`${this.keyDir}/${networkId}`);
        const content = { account_id: accountId, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() };
        await writeFile(this.getKeyFilePath(networkId, accountId), JSON.stringify(content), { mode: 0o600 });
    }
    /**
     * Gets a {@link KeyPair} from an unencrypted file
     * @param networkId The targeted network. (ex. default, betanet, etc…)
     * @param accountId The NEAR account tied to the key pair
     * @returns {Promise<KeyPair>}
     */
    async getKey(networkId, accountId) {
        // Find key / account id.
        if (!await exists(this.getKeyFilePath(networkId, accountId))) {
            return null;
        }
        const accountKeyPair = await readKeyFile(this.getKeyFilePath(networkId, accountId));
        return accountKeyPair[1];
    }
    /**
     * Deletes an unencrypted file holding a {@link KeyPair}
     * @param networkId The targeted network. (ex. default, betanet, etc…)
     * @param accountId The NEAR account tied to the key pair
     */
    async removeKey(networkId, accountId) {
        if (await exists(this.getKeyFilePath(networkId, accountId))) {
            await unlink(this.getKeyFilePath(networkId, accountId));
        }
    }
    /**
     * Deletes all unencrypted files from the `keyDir` path.
     */
    async clear() {
        for (const network of await this.getNetworks()) {
            for (const account of await this.getAccounts(network)) {
                await this.removeKey(network, account);
            }
        }
    }
    /** @hidden */
    getKeyFilePath(networkId, accountId) {
        return `${this.keyDir}/${networkId}/${accountId}.json`;
    }
    /**
     * Get the network(s) from files in `keyDir`
     * @returns {Promise<string[]>}
     */
    async getNetworks() {
        const files = await readdir(this.keyDir);
        const result = new Array();
        files.forEach((item) => {
            result.push(item);
        });
        return result;
    }
    /**
     * Gets the account(s) files in `keyDir/networkId`
     * @param networkId The targeted network. (ex. default, betanet, etc…)
     * @returns{Promise<string[]>}
     */
    async getAccounts(networkId) {
        if (!await exists(`${this.keyDir}/${networkId}`)) {
            return [];
        }
        const files = await readdir(`${this.keyDir}/${networkId}`);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace(/.json$/, ''));
    }
    /** @hidden */
    toString() {
        return `UnencryptedFileSystemKeyStore(${this.keyDir})`;
    }
}
