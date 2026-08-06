import { useEffect, useState } from 'react';
import { intercomCall } from '../services/intercom-call';

/**
 * React-binding mot intercom-samtale-tjenesten (singleton).
 * Returnerer live snapshot: { callState, peerName, busy, devices }.
 */
export const useIntercomCall = () => {
    const [snapshot, setSnapshot] = useState(intercomCall.getSnapshot());
    useEffect(() => intercomCall.subscribe(setSnapshot), []);
    return snapshot;
};
