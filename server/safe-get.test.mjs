import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { isPrivateAddress, safeGet } from './safe-get.mjs';

test('private, loopback, link-local and Tailscale addresses are refused; public ones are not', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.42.180', '169.254.1.1', '100.101.102.103', '::1', 'fd7a:115c:a1e0::1', 'fe80::1', '::ffff:192.168.1.1', '0.0.0.0'])
    assert.equal(isPrivateAddress(address), true, address);
  for (const address of ['8.8.8.8', '104.18.0.1', '2606:4700::6810:1'])
    assert.equal(isPrivateAddress(address), false, address);
});

test('a name that resolves to this machine is refused at connect time', async () => {
  const server = createServer((req, res) => res.end('secret')).listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  try {
    // A port is refused outright; on the default port, localhost's address is refused at connect.
    await assert.rejects(safeGet(`http://localhost:${server.address().port}/`), { code: 'EREFUSED_URL' });
    await assert.rejects(safeGet('http://localhost/'), { code: 'EPRIVATE' });
    await assert.rejects(safeGet('http://127.0.0.1/'), { code: 'EPRIVATE' });
  } finally {
    server.close();
  }
});
