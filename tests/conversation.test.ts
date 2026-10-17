import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationHeat, conversationState } from '../src/app/conversation.ts';

const sent = (preview = false) => ({ id: 'r', to: 'a@x.com', from: 'me@x.com', subject: '', body: '', sentAt: '2026-10-01T12:00:00Z', preview });

test('no reply either way is no conversation', () => {
  assert.equal(conversationState([{}]), null);
  assert.equal(conversationState([]), null);
});
test('a sent reply with no answer is waiting on them', () => {
  assert.equal(conversationState([{ replies: [sent()] }]), 'waiting');
});
test('a preview reply was never sent, so it starts nothing', () => {
  assert.equal(conversationState([{ replies: [sent(true)] }]), null);
});
test('their answer makes it a live conversation, over a sent reply', () => {
  assert.equal(conversationState([{ replies: [sent()], replyReceivedAt: '2026-10-02T09:00:00Z' }]), 'answered');
});
test('their answer email, filed as its own row, is the live conversation', () => {
  assert.equal(conversationState([{ respondsTo: 'gmail:abc' }]), 'answered');
});
test('any pitch in a grouped job decides for the whole card', () => {
  assert.equal(conversationState([{}, { replies: [sent()] }]), 'waiting');
  assert.equal(conversationState([{ replies: [sent()] }, { replyReceivedAt: '2026-10-02T09:00:00Z' }]), 'answered');
});

test('conversation heat deepens with every email either way, in five steps', () => {
  const talk = (sentCount: number, replyCount: number) => ({
    sent: Array.from({ length: sentCount }, () => sent()),
    replies: Array.from({ length: replyCount }, (_, i) => ({ id: `m${i}`, receivedAt: '2026-10-02T12:00:00Z', from: 'them@x.com' })),
  });
  assert.equal(conversationHeat(null, talk(0, 0)), null);
  assert.deepEqual(conversationHeat('waiting', talk(1, 0)), { state: 'waiting', messages: 1, level: 1 });
  assert.equal(conversationHeat('answered', talk(1, 1))?.level, 2);
  assert.equal(conversationHeat('answered', talk(2, 2))?.level, 3);
  assert.equal(conversationHeat('answered', talk(3, 2))?.level, 4);
  assert.equal(conversationHeat('answered', talk(4, 4))?.level, 5);
  assert.equal(conversationHeat('answered', talk(10, 10))?.level, 5);
  // An answer row with nothing counted yet is still a conversation, at the faintest heat.
  assert.equal(conversationHeat('answered', talk(0, 0))?.level, 1);
});
