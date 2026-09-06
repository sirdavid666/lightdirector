import mqtt, { type MqttClient } from 'mqtt';
import type { RoomCommand } from '@/lib/lightcast';

const brokerUrl = 'wss://broker.hivemq.com:8884/mqtt';

export type RoomConnection = {
  publish: (command: RoomCommand) => void;
  disconnect: () => void;
};

export function connectRoom(
  roomCode: string,
  onCommand: (command: RoomCommand) => void,
  onStatus?: (status: string) => void
): RoomConnection {
  const topic = `lightcast/${roomCode.trim().toUpperCase()}/commands`;
  const client: MqttClient = mqtt.connect(brokerUrl, {
    clientId: `lightcast-${Math.random().toString(36).slice(2, 10)}`,
    reconnectPeriod: 3000,
    clean: true,
  });

  client.on('connect', () => {
    client.subscribe(topic);
    onStatus?.('Room connected');
  });
  client.on('reconnect', () => onStatus?.('Reconnecting room…'));
  client.on('error', () => onStatus?.('Room unavailable'));
  client.on('message', (_topic, payload) => {
    try {
      onCommand(JSON.parse(payload.toString()) as RoomCommand);
    } catch {
      /* Ignore malformed broker traffic. */
    }
  });

  return {
    publish: (command) => {
      if (client.connected) client.publish(topic, JSON.stringify(command), { qos: 0 });
    },
    disconnect: () => client.end(true),
  };
}
