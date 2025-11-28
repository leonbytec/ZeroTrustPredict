import { useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';

import {
  PREDICT_COIN_ABI,
  PREDICT_COIN_ADDRESS,
  ZERO_TRUST_PREDICT_ABI,
  ZERO_TRUST_PREDICT_ADDRESS,
} from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { Header } from './Header';
import { CreatePredictionForm } from './CreatePredictionForm';
import { PredictionCard } from './PredictionCard';
import { TokenPanel } from './TokenPanel';
import '../styles/PredictionApp.css';

export type PredictionChainData = {
  id: number;
  title: string;
  creator: `0x${string}`;
  active: boolean;
  createdAt: number;
  options: string[];
  encryptedCounts: `0x${string}`[];
  encryptedStakes: `0x${string}`[];
  totalEncryptedStake: `0x${string}`;
};

export function PredictionApp() {
  const { address } = useAccount();
  const { instance, isLoading: zamaLoading } = useZamaInstance();
  const signerPromise = useEthersSigner();
  const [refreshIndex, setRefreshIndex] = useState(0);

  const {
    data: predictionCountData,
    refetch: refetchPredictionCount,
    isFetching: isFetchingCount,
  } = useReadContract({
    address: ZERO_TRUST_PREDICT_ADDRESS,
    abi: ZERO_TRUST_PREDICT_ABI,
    functionName: 'predictionsCount',
  });

  const predictionCount = Number(predictionCountData ?? 0n);

  const predictionContracts = useMemo(() => {
    if (!predictionCount) {
      return [];
    }
    return Array.from({ length: predictionCount }, (_, index) => ({
      address: ZERO_TRUST_PREDICT_ADDRESS,
      abi: ZERO_TRUST_PREDICT_ABI,
      functionName: 'getPrediction',
      args: [BigInt(index)],
    }));
  }, [predictionCount, refreshIndex]);

  const {
    data: predictionsData,
    isLoading: isLoadingPredictions,
    refetch: refetchPredictions,
  } = useReadContracts({
    contracts: predictionContracts,
    query: {
      enabled: predictionCount > 0,
    },
  });

  const userContracts = useMemo(() => {
    if (!address || !predictionCount) {
      return [];
    }
    const items: {
      address: typeof ZERO_TRUST_PREDICT_ADDRESS;
      abi: typeof ZERO_TRUST_PREDICT_ABI;
      functionName: 'getUserStake' | 'getUserChoice';
      args: readonly [bigint, `0x${string}`];
    }[] = [];
    for (let i = 0; i < predictionCount; i++) {
      const id = BigInt(i);
      items.push({
        address: ZERO_TRUST_PREDICT_ADDRESS,
        abi: ZERO_TRUST_PREDICT_ABI,
        functionName: 'getUserStake',
        args: [id, address],
      });
      items.push({
        address: ZERO_TRUST_PREDICT_ADDRESS,
        abi: ZERO_TRUST_PREDICT_ABI,
        functionName: 'getUserChoice',
        args: [id, address],
      });
    }
    return items;
  }, [address, predictionCount, refreshIndex]);

  const {
    data: userEncryptedData,
    refetch: refetchUserEncrypted,
    isLoading: isLoadingUserEncrypted,
  } = useReadContracts({
    contracts: userContracts,
    query: {
      enabled: Boolean(address && predictionCount > 0),
    },
  });

  const { data: balanceCiphertext, refetch: refetchBalance } = useReadContract({
    address: PREDICT_COIN_ADDRESS,
    abi: PREDICT_COIN_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
    },
  });

  const predictions: PredictionChainData[] = useMemo(() => {
    if (!predictionsData) {
      return [];
    }
    return predictionsData
      .map((row, index) => {
        if (!row || row.status !== 'success' || !row.result) {
          return null;
        }
        const result = row.result as unknown as [
          string,
          `0x${string}`,
          boolean,
          bigint,
          string[],
          `0x${string}`[],
          `0x${string}`[],
          `0x${string}`,
        ];
        return {
          id: index,
          title: result[0],
          creator: result[1],
          active: result[2],
          createdAt: Number(result[3]),
          options: result[4],
          encryptedCounts: result[5],
          encryptedStakes: result[6],
          totalEncryptedStake: result[7],
        } as PredictionChainData;
      })
      .filter((item): item is PredictionChainData => Boolean(item));
  }, [predictionsData]);

  const userPredictionData = useMemo(() => {
    const data: Record<
      number,
      {
        stake?: `0x${string}`;
        choice?: `0x${string}`;
      }
    > = {};
    if (!userEncryptedData || !address) {
      return data;
    }
    userEncryptedData.forEach((entry, index) => {
      if (!entry || entry.status !== 'success' || !entry.result) {
        return;
      }
      const predictionIndex = Math.floor(index / 2);
      if (!data[predictionIndex]) {
        data[predictionIndex] = {};
      }
      if (index % 2 === 0) {
        data[predictionIndex].stake = entry.result as `0x${string}`;
      } else {
        data[predictionIndex].choice = entry.result as `0x${string}`;
      }
    });
    return data;
  }, [userEncryptedData, address]);

  const handleRefresh = () => {
    setRefreshIndex((value) => value + 1);
    refetchPredictionCount?.();
    refetchPredictions?.();
    refetchUserEncrypted?.();
    refetchBalance?.();
  };

  const showEmptyState = predictionCount === 0 && !isFetchingCount;

  return (
    <div className="prediction-app">
      <Header />
      <main className="prediction-body">
        <TokenPanel
          address={address}
          balanceHandle={balanceCiphertext as `0x${string}` | undefined}
          instance={instance}
          signerPromise={signerPromise}
          zamaLoading={zamaLoading}
          onRefetch={handleRefresh}
        />
        <div className="prediction-layout">
          <CreatePredictionForm signerPromise={signerPromise} onCreated={handleRefresh} />

          <section className="prediction-list">
            <div className="prediction-list__header">
              <div>
                <h2>Live Predictions</h2>
                <p>Encrypted selections and stakes are updated in real time.</p>
              </div>
              <div className="prediction-list__meta">
                <span className="prediction-count">
                  {isFetchingCount ? 'Loading...' : `${predictionCount} total`}
                </span>
                <button className="ghost-button" onClick={handleRefresh}>
                  Refresh
                </button>
              </div>
            </div>

            {showEmptyState ? (
              <div className="empty-state">
                <h3>No predictions created yet</h3>
                <p>Create the first encrypted market and invite others to stake PredictCoin.</p>
              </div>
            ) : (
              <div className="prediction-cards">
                {predictions.map((prediction) => (
                  <PredictionCard
                    key={prediction.id}
                    prediction={prediction}
                    zamaInstance={instance}
                    signerPromise={signerPromise}
                    address={address}
                    zamaLoading={zamaLoading}
                    userStakeHandle={userPredictionData[prediction.id]?.stake}
                    userChoiceHandle={userPredictionData[prediction.id]?.choice}
                    onActionComplete={handleRefresh}
                    isLoadingRead={isLoadingPredictions || isLoadingUserEncrypted}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
