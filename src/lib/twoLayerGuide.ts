export const TWO_LAYER_GUIDE_URL = 'https://t.me/mapkluss';
export const TWO_LAYER_GUIDE_ACK_KEY = 'mapkluss_two_layer_guide_ack_v1';

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasAcknowledgedTwoLayerGuide(storage: StorageReader | null = browserStorage()): boolean {
  try {
    return storage?.getItem(TWO_LAYER_GUIDE_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeTwoLayerGuide(storage: StorageWriter | null = browserStorage()): void {
  try {
    storage?.setItem(TWO_LAYER_GUIDE_ACK_KEY, '1');
  } catch {
    // Private browsing can reject storage writes. The current confirmation
    // still applies; the guide may be shown again on the next visit.
  }
}
