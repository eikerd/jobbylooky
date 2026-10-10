import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationState } from '../src/app/conversation.ts';

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
