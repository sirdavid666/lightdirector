import { Platform } from 'react-native';
import * as nativePublisher from '@/lib/streamingService.native';
import * as webPublisher from '@/lib/streamingService.web';

export type PublishRequest = { secureStreamUrl: string; grade: unknown };

const publisher = Platform.OS === 'web' ? webPublisher : nativePublisher;

export const startPublishing = (request: PublishRequest) => publisher.startPublishing(request);
export const stopPublishing = () => publisher.stopPublishing();
