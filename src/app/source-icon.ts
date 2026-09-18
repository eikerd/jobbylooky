import { senderIdentity } from './profiles';

export function emailSource(from: string) {
  const domain = senderIdentity(from, '').email.split('@')[1] || '';
  const matches = (host: string) => domain === host || domain.endsWith(`.${host}`);
  if (matches('linkedin.com')) return { kind: 'linkedin', name: 'LinkedIn', mark: 'in' };
  if (matches('dice.com')) return { kind: 'dice', name: 'Dice', mark: 'dice' };
  if (matches('indeed.com')) return { kind: 'indeed', name: 'Indeed', mark: 'i' };
  if (matches('ziprecruiter.com')) return { kind: 'ziprecruiter', name: 'ZipRecruiter', mark: 'Z' };
  if (matches('glassdoor.com')) return { kind: 'glassdoor', name: 'Glassdoor', mark: 'G' };
  return { kind: 'email', name: 'Email', mark: '✉' };
}
