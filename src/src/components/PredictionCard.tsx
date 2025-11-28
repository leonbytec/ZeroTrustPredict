import { useMemo, useState } from 'react';
import { Contract, type JsonRpcSigner } from 'ethers';

import {
  PREDICT_COIN_ADDRESS,
  ZERO_TRUST_PREDICT_ABI,
  ZERO_TRUST_PREDICT_ADDRESS,
} from '../config/contracts';
import type { PredictionChainData } from './PredictionApp';
import { formatAddress, formatDateTime, formatTokenAmount, parseAmountInput } from '../utils/format';
import '../styles/PredictionCard.css';

interface Props {
  prediction: PredictionChainData;
  zamaInstance: any;
  signerPromise?: Promise<JsonRpcSigner>;
  address?: `0x${string}`;
  zamaLoading: boolean;
  userStakeHandle?: `0x${string}`;
  userChoiceHandle?: `0x${string}`;
  onActionComplete: () => void;
  isLoadingRead: boolean;
}

type DecryptionResult = {
  counts: string[];
  stakes: string[];
  totalStake: string;
  userStake?: string;
  userChoice?: number;
};

export function PredictionCard({
  prediction,
  zamaInstance,
  signerPromise,
  address,
  zamaLoading,
  userStakeHandle,
  userChoiceHandle,
  onActionComplete,
  isLoadingRead,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedData, setDecryptedData] = useState<DecryptionResult | null>(null);

  const createdAtText = useMemo(() => formatDateTime(prediction.createdAt), [prediction.createdAt]);

  const handleSelection = (index: number) => {
    setSelectedOption(index);
    setStatusMessage('');
  };

  const handlePlaceSelection = async () => {
    if (!address) {
      alert('Connect a wallet to place selections.');
      return;
    }
    if (!zamaInstance || !signerPromise) {
      alert('Encryption service is not ready yet.');
      return;
    }
    if (selectedOption === null) {
      alert('Select an option to continue.');
      return;
    }
    try {
      const stakeValue = parseAmountInput(amountInput);
      setIsSubmitting(true);
      const encryptedOption = await zamaInstance
        .createEncryptedInput(ZERO_TRUST_PREDICT_ADDRESS, address)
        .add8(selectedOption)
        .encrypt();
      const encryptedStake = await zamaInstance
        .createEncryptedInput(PREDICT_COIN_ADDRESS, ZERO_TRUST_PREDICT_ADDRESS)
        .add64(stakeValue)
        .encrypt();

      const signer = await signerPromise;
      const contract = new Contract(ZERO_TRUST_PREDICT_ADDRESS, ZERO_TRUST_PREDICT_ABI, signer);
      const tx = await contract.placeEncryptedSelection(
        prediction.id,
        encryptedOption.handles[0],
        encryptedOption.inputProof,
        encryptedStake.handles[0],
        encryptedStake.inputProof,
      );
      await tx.wait();
      setAmountInput('');
      setStatusMessage('Encrypted selection confirmed.');
      onActionComplete();
    } catch (error) {
      console.error(error);
      setStatusMessage('Failed to submit selection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecrypt = async () => {
    if (!address || !zamaInstance || !signerPromise) {
      alert('Connect wallet and wait for the encryption service to finish loading.');
      return;
    }
    setIsDecrypting(true);
    setStatusMessage('');
    try {
      const keypair = zamaInstance.generateKeypair();
      const handlePairs = [
        ...prediction.encryptedCounts.map((handle) => ({
          handle,
          contractAddress: ZERO_TRUST_PREDICT_ADDRESS,
        })),
        ...prediction.encryptedStakes.map((handle) => ({
          handle,
          contractAddress: ZERO_TRUST_PREDICT_ADDRESS,
        })),
        {
          handle: prediction.totalEncryptedStake,
          contractAddress: ZERO_TRUST_PREDICT_ADDRESS,
        },
      ];

      if (userStakeHandle) {
        handlePairs.push({ handle: userStakeHandle, contractAddress: ZERO_TRUST_PREDICT_ADDRESS });
      }
      if (userChoiceHandle) {
        handlePairs.push({ handle: userChoiceHandle, contractAddress: ZERO_TRUST_PREDICT_ADDRESS });
      }

      const startTime = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const eip712 = zamaInstance.createEIP712(
        keypair.publicKey,
        [ZERO_TRUST_PREDICT_ADDRESS],
        startTime,
        durationDays,
      );

      const signer = await signerPromise;
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await zamaInstance.userDecrypt(
        handlePairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [ZERO_TRUST_PREDICT_ADDRESS],
        address,
        startTime,
        durationDays,
      );

      const counts = prediction.encryptedCounts.map((handle) => {
        const raw = result[handle as string] ?? '0';
        return raw.toString();
      });
      const stakes = prediction.encryptedStakes.map((handle) => {
        const raw = result[handle as string] ?? '0';
        return formatTokenAmount(raw);
      });
      const totalStakeValue = formatTokenAmount(result[prediction.totalEncryptedStake as string] ?? '0');

      setDecryptedData({
        counts,
        stakes,
        totalStake: totalStakeValue,
        userStake: userStakeHandle ? formatTokenAmount(result[userStakeHandle as string] ?? '0') : undefined,
        userChoice: userChoiceHandle ? Number(result[userChoiceHandle as string] ?? '0') : undefined,
      });
    } catch (error) {
      console.error(error);
      setStatusMessage('Unable to decrypt values.');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <article className="prediction-card">
      <header className="prediction-card__header">
        <div>
          <h3>{prediction.title}</h3>
          <p>
            Created {createdAtText} • Creator {formatAddress(prediction.creator)}
          </p>
        </div>
        <span className={`status-chip ${prediction.active ? 'active' : 'paused'}`}>
          {prediction.active ? 'Active' : 'Paused'}
        </span>
      </header>

      <div className="prediction-card__content">
        <div className="options-panel">
          {prediction.options.map((option, index) => (
            <label key={`${prediction.id}-${option}`} className="option-item">
              <input
                type="radio"
                name={`prediction-${prediction.id}`}
                checked={selectedOption === index}
                onChange={() => handleSelection(index)}
              />
              <div>
                <span className="option-label">{option}</span>
                {decryptedData ? (
                  <span className="option-sub">
                    {decryptedData.counts[index]} selection(s) • {decryptedData.stakes[index]} PCoin
                  </span>
                ) : (
                  <span className="option-sub">Encrypted activity</span>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="stake-panel">
          <label>
            <span>Stake amount (PCoin)</span>
            <input
              type="text"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="e.g. 2.5"
            />
          </label>
          <button className="primary-button" onClick={handlePlaceSelection} disabled={isSubmitting || zamaLoading}>
            {isSubmitting ? 'Submitting...' : 'Stake & Encrypt'}
          </button>
          <button className="ghost-button" onClick={handleDecrypt} disabled={isDecrypting || zamaLoading}>
            {isDecrypting ? 'Decrypting...' : 'Decrypt tallies'}
          </button>
          <button className="ghost-button" onClick={onActionComplete} disabled={isLoadingRead}>
            Refresh data
          </button>
          {statusMessage ? <p className="status-line">{statusMessage}</p> : null}
        </div>
      </div>

      {decryptedData ? (
        <div className="decrypted-panel">
          <div>
            <h4>Total staked</h4>
            <p>{decryptedData.totalStake} PCoin</p>
          </div>
          {decryptedData.userStake ? (
            <div>
              <h4>Your stake</h4>
              <p>
                {decryptedData.userStake} PCoin{' '}
                {(decryptedData.userChoice !== undefined && prediction.options[decryptedData.userChoice])
                  ? `on "${prediction.options[decryptedData.userChoice]}"`
                  : ''}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
