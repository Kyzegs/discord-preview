import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { APIMessage, RESTPostAPIChannelMessageJSONBody } from 'discord-api-types/v10';
import type { PreviewMessage } from '../src/types.ts';

// Checked by `pnpm typecheck`: a message received from Discord and a body about to be sent both fit PreviewMessage.
type Fits<T extends PreviewMessage> = T;
export type Received = Fits<APIMessage>;
export type Sent = Fits<RESTPostAPIChannelMessageJSONBody>;

test('types: discord-api-types messages fit PreviewMessage (checked by tsc)', () => {
  assert.ok(true);
});
