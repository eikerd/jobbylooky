import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';

// Links in unsolicited email decide where the Mac's sweep connects, so it must never reach the
// owner's own network: a public name can resolve to a LAN address, and a page can redirect
// there. The check runs at connect time, on the address actually dialled.

const PRIVATE = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 3]])
  PRIVATE.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) PRIVATE.addSubnet(net, bits, 'ipv6');

/** True for loopback, private, link-local, CGNAT (Tailscale) and multicast addresses. */
export function isPrivateAddress(address) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  const family = isIP(address);
  return family === 0 || PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** dns.lookup that refuses to hand a private address to the socket. */
function guardedLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const blocked = addresses.find(({ address }) => isPrivateAddress(address));
    if (blocked) return callback(Object.assign(new Error(`${hostname} resolves to a private address`), { code: 'EPRIVATE' }));
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_HOPS = 5;

/**
 * GET a public http(s) URL, following at most five redirects, each one checked again. Reads up
 * to `maxBytes` of the body when `wantBody(headers)` says so. Errors carry a `code`
 * (ENOTFOUND, EPRIVATE, ETIMEDOUT, …).
 */
export async function safeGet(url, { headers = {}, timeoutMs = 20000, maxBytes = 1024 * 1024, wantBody = () => false } = {}) {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!['http:', 'https:'].includes(current.protocol) || current.port || current.username)
      throw Object.assign(new Error(`Refused to follow ${current.protocol}//${current.host}`), { code: 'EREFUSED_URL' });
    if (isIP(current.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(current.hostname.replace(/^\[|\]$/g, '')))
      throw Object.assign(new Error('Private address'), { code: 'EPRIVATE' });
    const response = await request(current, headers, timeoutMs, maxBytes, wantBody);
    if (REDIRECTS.has(response.status) && response.headers.location) {
      current = new URL(response.headers.location, current);
      continue;
    }
    return response;
  }
  throw Object.assign(new Error('Too many redirects'), { code: 'EREDIRECTS' });
}

function request(url, headers, timeoutMs, maxBytes, wantBody) {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, { headers, lookup: guardedLookup, timeout: timeoutMs }, (res) => {
      const result = { status: res.statusCode ?? 0, headers: res.headers, body: '' };
      if (REDIRECTS.has(result.status) || !wantBody(res.headers)) {
        res.destroy();
        return resolve(result);
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        if (size >= maxBytes) res.destroy();
      });
      const finish = () => resolve({ ...result, body: Buffer.concat(chunks).toString('utf8') });
      res.on('end', finish);
      res.on('close', finish);
      res.on('error', finish);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
  });
}
