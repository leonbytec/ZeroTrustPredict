import { useState } from 'react';
import { Contract, type JsonRpcSigner } from 'ethers';

import {
  PREDICT_COIN_ABI,
  PREDICT_COIN_ADDRESS,
  ZERO_TRUST_PREDICT_ADDRESS,
} from '../config/contracts';
import { formatAddress, formatTokenAmount } from '../utils/format';
import '../styles/TokenPanel.css';

interface Props {
  address?: `0x${string}`;
  balanceHandle?: `0x${string}`;
  instance: any;
  signerPromise?: Promise<JsonRpcSigner>;
  zamaLoading: boolean;
  onRefetch: () => void;
}

export function TokenPanel({ address, balanceHandle, instance, signerPromise, zamaLoading, onRefetch }: Props) {
  const [status, setStatus] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  const ensureSigner = async () => {
    if (!signerPromise) {
      throw new Error('Connect a wallet to continue.');
    }
    return signerPromise;
  };

  const handleFaucet = async () => {
    try {
      setStatus('Requesting faucet...');
      const signer = await ensureSigner();
      const contract = new Contract(PREDICT_COIN_ADDRESS, PREDICT_COIN_ABI, signer);
      const tx = await contract.faucet();
      await tx.wait();
      setStatus('Faucet tokens received.');
      onRefetch();
    } catch (error) {
      console.error(error);
      setStatus('Unable to use faucet.');
    }
  };

  const handleAuthorize = async () => {
    try {
      setStatus('Authorizing ZeroTrustPredict...');
      const signer = await ensureSigner();
      const contract = new Contract(PREDICT_COIN_ADDRESS, PREDICT_COIN_ABI, signer);
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const tx = await contract.setOperator(ZERO_TRUST_PREDICT_ADDRESS, expiresAt);
      await tx.wait();
      setStatus('Operator configured.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to set operator.');
    }
  };

  const handleDecryptBalance = async () => {
    if (!instance || !address || !balanceHandle) {
      alert('Balance is currently unavailable.');
      return;
    }
    setIsDecrypting(true);
    try {
      const keypair = instance.generateKeypair();
      const startTime = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const eip712 = instance.createEIP712(keypair.publicKey, [PREDICT_COIN_ADDRESS], startTime, durationDays);
      const signer = await ensureSigner();
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );
      const result = await instance.userDecrypt(
        [
          {
            handle: balanceHandle,
            contractAddress: PREDICT_COIN_ADDRESS,
          },
        ],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [PREDICT_COIN_ADDRESS],
        address,
        startTime,
        durationDays,
      );
      const clear = result[balanceHandle as string] ?? '0';
      setBalance(`${formatTokenAmount(clear)} PCoin`);
    } catch (error) {
      console.error(error);
      setStatus('Unable to decrypt balance.');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <section className="token-panel">
      <div>
        <h2>PredictCoin controls</h2>
        <p>Mint tokens, authorize the market contracts, and decrypt your confidential balance.</p>
      </div>
      <div className="token-actions">
        <div>
          <p>Wallet</p>
          <strong>{address ? formatAddress(address) : 'Connect a wallet'}</strong>
        </div>
        <div>
          <p>Balance</p>
          <strong>{balance ?? 'Encrypted'}</strong>
        </div>
      </div>
      <div className="token-buttons">
        <button className="ghost-button" onClick={handleFaucet} disabled={!signerPromise}>
          Claim faucet
        </button>
        <button className="ghost-button" onClick={handleAuthorize} disabled={!signerPromise}>
          Authorize market
        </button>
        <button className="primary-button" onClick={handleDecryptBalance} disabled={isDecrypting || zamaLoading}>
          {isDecrypting ? 'Decrypting...' : 'Decrypt balance'}
        </button>
        <button className="ghost-button" onClick={onRefetch}>
          Refresh
        </button>
      </div>
      {status ? <p className="status-line">{status}</p> : null}
    </section>
  );
}
