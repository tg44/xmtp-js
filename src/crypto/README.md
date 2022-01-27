Cryptographic classes and utilities for use in XMTP client libraries.

The API is designed around the needs of the messaging framework.

## Managing keys associated with a wallet

Each participating wallet is associated with a one key bundle comprised of an identity key and periodically rotated pre-keys. The public key bundle is advertised on the network and used by future senders to protect messages addressed to the wallet.
The public key bundles of both the sender and the recipient that were used to protect a message are also attached to the message for transport/storage.
The private key bundle must be stored and kept secret. It is required to decrypt the incoming messages.

Following snippet shows the API for managing key bundles (assuming a connected wallet is accessible as `wallet` implementing `ethers.Signer` interface):

```js
// generate new wallet keys
let pri = await PrivateKeyBundle.generate()
let pub = pri.publicKeyBundle

// sign the identity key using the wallet
await pub.identityKey.signWithWallet(wallet)

// serialize the public bundle for advertisement on the network
let bytes = pub.toBytes()

// serialize/encrypt the private bundle for secure storage
bytes = await pri.encode(wallet)

// deserialize/decrypt private key bundle from storage
let pri2 = await PrivateKeyBundle.decode(wallet, bytes)
```

## Encrypting/decrypting payload

The sender must obtain the advertized public key bundle of the recipient and use it and his/her private key bundle to derive a shared secret that is then used as input into the symmetric encryption of the payload.

```js
// deserializing recipient's public key bundle (bytes obtained from the network)
recipient = PublicKeyBundle.fromBytes(bytes)

// encrypting binary `payload` for submission to the network
// `sender` is sender's PrivateKeyBundle
let secret = await sender.sharedSecret(recipient, false)
let bytes = await encrypt(payload, secret)
```

## Receiving a message

The recipient must use his/her private key bundle to decrypt the incoming message.
The sender's public key bundle is bundled with the message, the sender's address is derived from the key bundle and can be trusted as authentic.
If the message was tampered with or the key signatures don't check out, the decoding process will throw.

```js
// decrypt the encrypted payload received from the network
// `recipient` is the recipient's PrivateKeyBundle
// `sender` is the sender's PublicKeyBundle (normally attached to the message)
let secret = await recipient.sharedSecret(sender, true)
let decrypted = await decrypt(encrypted, secret)

// senders address can be derived from the key bundle
let address = sender.walletSignatureAddress()
```

## Implementation Notes

The cryptographic primitives are built around the standard Web Crypto API and the [@noble libraries](https://paulmillr.com/noble/).
The funcionality includes:

- EC Public/Private Keys (secp256k1)
- ECDSA signatures and signing of public keys
- shared secret derivation (ECDH)
- authenticated symmetric encryption (AEAD: AES-256-GCM)
- symmetric key derivation (HKDF-SHA-256)
- X3DH style key bundles

Protobuf is used for serialization throughout. The protobuf message structure is set up for algorithm agility, i.e. ability to replace algorithms or expand the set of supported algorithms in backward compatible manner. Protobuf should help with interoperability between Javascript clients and Golang based nodes.

# TODO

- PrivateKeyBundle should have a collection of preKeys
- distinguish wallet signatures from direct signatures
- add key timestamp
- sanity checking to avoid common mistakes
- wiping of sensitive material
- decoded keys/messages have Buffers instead of Uint8Arrays; problem?