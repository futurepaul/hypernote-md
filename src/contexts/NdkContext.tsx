import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import NDK, { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

const NdkContext = createContext<NDK | null>(null);

export function NdkProvider({ children }: { children: ReactNode }) {
  let privkey = localStorage.getItem("privkey");
  
  if (!privkey) {
    const newPrivkey = prompt("Please enter your private key");
    localStorage.setItem("privkey", newPrivkey);
    privkey = newPrivkey;
  }

  const ndk = new NDK({
    explicitRelayUrls: ["wss://relay.nostr.net"],
    signer: new NDKPrivateKeySigner(privkey),
  });

  ndk.connect();

  return (
    <NdkContext.Provider value={ndk}>
      {children}
    </NdkContext.Provider>
  );
}

export function useNdk() {
  const ndk = useContext(NdkContext);
  if (!ndk) {
    throw new Error('useNdk must be used within an NdkProvider');
  }
  return ndk;
} 