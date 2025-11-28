import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'ZeroTrustPredict',
  projectId: 'zero-trust-predict',
  chains: [sepolia],
  ssr: false,
});
