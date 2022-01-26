import * as assert from 'assert';
import { TextEncoder, TextDecoder } from 'util';
import {
  KeyBundle,
  PrivateKeyBundle,
  PrivateKey,
  PublicKey,
  utils
} from '../../src/crypto';
import * as ethers from 'ethers';
import Message from '../../src/Message';

describe('Crypto', function () {
  it('signs keys and verifies signatures', async function () {
    // Identity Key
    const [iPri, iPub] = PrivateKey.generateKeys();
    // Pre-Key
    const [, pPub] = PrivateKey.generateKeys();
    await iPri.signKey(pPub);
    assert.ok(await iPub.verifyKey(pPub));
  });
  it('encrypts and decrypts messages', async function () {
    // Alice
    const [aPri, aPub] = PrivateKey.generateKeys();
    // Bob
    const [bPri, bPub] = PrivateKey.generateKeys();
    const msg1 = 'Yo!';
    const decrypted = new TextEncoder().encode(msg1);
    // Alice encrypts msg for Bob.
    const encrypted = await aPri.encrypt(decrypted, bPub);
    // Bob decrypts msg from Alice.
    const decrypted2 = await bPri.decrypt(encrypted, aPub);
    const msg2 = new TextDecoder().decode(decrypted2);
    assert.equal(msg2, msg1);
  });
  it('detects tampering with encrypted message', async function () {
    // Alice
    const [aPri, aPub] = PrivateKey.generateKeys();
    // Bob
    const [bPri, bPub] = PrivateKey.generateKeys();
    const msg1 = 'Yo!';
    const decrypted = new TextEncoder().encode(msg1);
    // Alice encrypts msg for Bob.
    const encrypted = await aPri.encrypt(decrypted, bPub);
    // Malory tampers with the message
    assert.ok(encrypted.aes256GcmHkdfSha256);
    encrypted.aes256GcmHkdfSha256.payload[2] ^= 4; // flip one bit
    // Bob attempts to decrypt msg from Alice.
    try {
      await bPri.decrypt(encrypted, aPub);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
      // Note: This is Node behavior, not sure what browsers will do.
      assert.equal(e.toString(), 'Error: Cipher job failed');
    }
  });
  it('derives public key from signature', async function () {
    const [pri, pub] = PrivateKey.generateKeys();
    const digest = utils.getRandomValues(new Uint8Array(16));
    const sig = await pri.sign(digest);
    const pub2 = sig.getPublicKey(digest);
    assert.ok(pub2);
    assert.ok(pub2.secp256k1Uncompressed);
    assert.ok(pub.secp256k1Uncompressed);
    assert.equal(
      utils.bytesToHex(pub2.secp256k1Uncompressed.bytes),
      utils.bytesToHex(pub.secp256k1Uncompressed.bytes)
    );
  });
  it('derives address from public key', function () {
    // using the sample from https://kobl.one/blog/create-full-ethereum-keypair-and-address/
    const bytes = utils.hexToBytes(
      '04836b35a026743e823a90a0ee3b91bf615c6a757e2b60b9e1dc1826fd0dd16106f7bc1e8179f665015f43c6c81f39062fc2086ed849625c06e04697698b21855e'
    );
    const pub = new PublicKey({
      secp256k1Uncompressed: { bytes }
    });
    const address = pub.getEthereumAddress();
    assert.equal(address, '0x0bed7abd61247635c1973eb38474a2516ed1d884');
  });
  it('encrypts and decrypts messages with key bundles', async function () {
    // Alice
    const [aPri, aPub] = await PrivateKeyBundle.generateBundles();
    // Bob
    const [bPri, bPub] = await PrivateKeyBundle.generateBundles();
    const msg1 = 'Yo!';
    const decrypted = new TextEncoder().encode(msg1);
    // Alice encrypts msg for Bob.
    const encrypted = await Message.encrypt(decrypted, aPri, bPub);
    // Bob decrypts msg from Alice.
    const decrypted2 = await Message.decrypt(encrypted, aPub, bPri);
    const msg2 = new TextDecoder().decode(decrypted2);
    assert.equal(msg2, msg1);
  });
  it('serializes and desirializes keys and signatures', async function () {
    const [, pub] = await PrivateKeyBundle.generateBundles();
    const bytes = pub.toBytes();
    assert.ok(bytes.length >= 213);
    const pub2 = KeyBundle.fromBytes(bytes);
    assert.ok(pub2.identityKey);
    assert.ok(pub2.preKey);
    assert.ok(pub2.identityKey.verifyKey(pub2.preKey));
  });
  it('fully encodes/decodes messages', async function () {
    // Alice's wallet
    const pri = PrivateKey.generate();
    assert.ok(pri.secp256k1);
    const wallet = new ethers.Wallet(pri.secp256k1.bytes);
    // Alice's key bundle
    const [aPri, aPub] = await PrivateKeyBundle.generateBundles();
    assert.deepEqual(aPri.identityKey?.getPublicKey(), aPub.identityKey);
    // sign Alice's identityKey with her wallet
    assert.ok(aPub.identityKey);
    await aPub.identityKey.signWithWallet(wallet);
    // Bob
    const [bPri, bPub] = await PrivateKeyBundle.generateBundles();
    const msg1 = await Message.encode(aPri, bPub, 'Yo!');
    const msg2 = await Message.decode(bPri, msg1.toBytes());
    assert.equal(msg1.decrypted, 'Yo!');
    assert.equal(msg1.decrypted, msg2.decrypted);

    let address = aPub.identityKey.walletSignatureAddress();
    assert.equal(address, wallet.address);

    assert.ok(msg1.header?.sender?.identityKey);
    address = new PublicKey(
      msg1.header.sender.identityKey
    ).walletSignatureAddress();
    assert.equal(address, wallet.address);

    assert.ok(msg2.header?.sender?.identityKey);
    address = new PublicKey(
      msg2.header.sender.identityKey
    ).walletSignatureAddress();
    assert.equal(address, wallet.address);
  });
  it('signs keys using a wallet', async function () {
    // create a wallet using a generated key
    const [wPri, wPub] = PrivateKey.generateKeys();
    assert.ok(wPri.secp256k1);
    const wallet = new ethers.Wallet(wPri.secp256k1.bytes);
    // sanity check that we agree with the wallet about the address
    assert.ok(wallet.address, wPub.getEthereumAddress());
    // sign the public key using the wallet
    await wPub.signWithWallet(wallet);
    // validate the key signature and return wallet address
    const address = wPub.walletSignatureAddress();
    assert.equal(address, wallet.address);
  });
  it('encrypts private key bundle for storage using a wallet', async function () {
    // create a wallet using a generated key
    const [wPri] = PrivateKey.generateKeys();
    assert.ok(wPri.secp256k1);
    const wallet = new ethers.Wallet(wPri.secp256k1.bytes);
    // generate key bundle
    const [pri] = await PrivateKeyBundle.generateBundles();
    // encrypt and serialize the bundle for storage
    const bytes = await pri.encode(wallet);
    // decrypt and decode the bundle from storage
    const pri2 = await PrivateKeyBundle.decode(wallet, bytes);
    assert.ok(pri.identityKey);
    assert.ok(pri2.identityKey);
    assert.ok(pri.identityKey.secp256k1);
    assert.ok(pri2.identityKey.secp256k1);
    assert.ok(
      utils.equalBytes(
        pri.identityKey.secp256k1.bytes,
        pri2.identityKey.secp256k1.bytes
      )
    );
    assert.ok(pri.preKey.secp256k1);
    assert.ok(pri2.preKey.secp256k1);
    assert.ok(
      utils.equalBytes(pri.preKey.secp256k1.bytes, pri2.preKey.secp256k1.bytes)
    );
  });
});
