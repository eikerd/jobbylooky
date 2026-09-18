import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screen, isOpportunity } from './screen.mjs';
const mail = (subject, body, extra = {}) => ({
  subject,
  body,
  from: 'recruiter@example.com',
  ...extra,
});

test('owner-identified Fidelity location combinations produce an unconfirmed clue', () => {
  const result = screen(mail('Angular Developer', 'Location: Jersey City, NJ, Westlake, TX, Raleigh, NC, Boston, MA, Smithfield, RI, Merrimack, NH Salt Lake City (Hybrid)'));
  const clue = result.reasons.find(reason => /Possible Fidelity/.test(reason.text));
  assert.equal(clue?.kind, 'check');
  assert.match(clue?.evidence || '', /Westlake, TX.*Merrimack, NH.*Smithfield, RI/);
  assert.equal(result.company, 'Not stated');
});
test('single cities, signatures, and explicit clients do not infer Fidelity', () => {
  for (const body of [
    'Location: Westlake, TX',
    'Location: Dallas, TX',
    'Location: Westlake, Ohio, Merrimack, NH',
    'Location: Remote\nThanks\nOffices: Westlake, TX, Merrimack, NH',
    'Client: Example Company\nLocation: Westlake, TX, Merrimack, NH',
  ]) assert.ok(!screen(mail('Angular Developer', body)).reasons.some(reason => /Possible Fidelity/.test(reason.text)), body);
});

test('Raleigh and Ohio together flag a possible Chase pattern without setting the company', () => {
  for (const location of ['Dallas, TX / Raleigh, NC / Ohio', 'Raleigh NC; Columbus, OH']) {
    const result = screen(mail('Angular Developer', `Location: ${location}`));
    const clue = result.reasons.find(reason => reason.text.startsWith('Possible Chase:'));
    assert.equal(clue?.kind, 'check');
    assert.equal(clue?.evidence, location);
    assert.equal(result.company, 'Not stated');
  }
});
test('Raleigh alone, Ohio alone, signatures, and named clients do not trigger Chase inference', () => {
  for (const body of [
    'Location: Raleigh, NC',
    'Location: Columbus, OH',
    'Location: Dallas, TX / Raleigh, NC',
    'Location: Remote\nThanks\nOur offices: Raleigh, NC and Ohio',
    'Client: Example Company\nLocation: Raleigh, NC / Ohio',
  ]) assert.ok(!screen(mail('Angular Developer', body)).reasons.some(reason => reason.text.startsWith('Possible Chase:')), body);
});

test('Westlake Texas is an interest location independent of skill fit', () => {
  for (const location of ['Westlake, Texas', 'Westlake TX', 'Westlake, TX (Hybrid)']) {
    const result = screen(mail('Angular Developer', `Location: ${location}`));
    assert.equal(result.fit, 'Review');
    assert.ok(result.reasons.some(reason => reason.kind === 'pass' && /Westlake, Texas is a location of interest/.test(reason.text)));
    assert.ok(!result.reasons.some(reason => reason.kind === 'fail'));
  }
  const java = screen(mail('Java Developer', 'Location: Westlake, Texas\nRequired: Java and Spring Boot'));
  assert.equal(java.fit, 'Mismatch');
  assert.ok(java.reasons.some(reason => reason.kind === 'pass' && /location of interest/.test(reason.text)));
  assert.equal(screen(mail('Angular Developer', 'Location: Westlake, Ohio')).fit, 'Mismatch');
  const subject = screen(mail('Angular Developer - Westlake TX', 'Required: Angular'));
  assert.equal(subject.location, 'Westlake, TX');
  const signature = screen(mail('Angular Developer', 'Location: Boston, MA\nThanks\nRecruiter in Westlake, TX'));
  assert.equal(signature.fit, 'Mismatch');
  assert.ok(!signature.reasons.some(reason => /location of interest/.test(reason.text)));
});

test('Angular and JavaScript are not Java; recruiter address is not job location', () => {
  const result = screen(
    mail(
      'UI/Angular developer',
      'Location: Remote\nRequired: Angular, JavaScript and TypeScript\nThanks\nRecruiter\nNew Jersey',
    ),
  );
  assert.equal(result.fit, 'Strong fit');
  assert.equal(result.location, 'Remote');
});
test('testing and interest do not become EST restrictions', () => {
  const result = screen(
    mail(
      'Angular Developer Remote',
      'We appreciate your interest.\nStrong Playwright testing experience. Angular.',
    ),
  );
  assert.equal(result.fit, 'Strong fit');
});
test('full stack Java with Angular is a mismatch', () => {
  const result = screen(
    mail(
      'Full Stack Java/Angular developers //Remote',
      'Location: Remote\nBackend must haves: Java senior level and Spring Boot.',
    ),
  );
  assert.equal(result.fit, 'Mismatch');
  assert.match(result.reasons[0].text, /Java/);
});
test('Dallas Angular and Node.js roles are potential fits after remote', () => {
  assert.equal(
    screen(mail('Angular + Node.js developer', 'Location: Dallas, TX')).fit,
    'Potential fit',
  );
});

test('fully remote Angular and Node.js match the top location and stack preferences', () => {
  const result = screen(mail('Angular + Node.js Developer', 'Location: Fully remote\nRequired: Angular, Node.js'));
  assert.equal(result.fit, 'Strong fit');
  assert.ok(result.reasons.some(reason => reason.kind === 'pass' && /Node.js matches/.test(reason.text)));
  assert.ok(result.reasons.some(reason => /first location priority/.test(reason.text)));
  assert.equal(screen(mail('Angular Developer', 'Location: Dallas, TX')).fit, 'Potential fit');
  for (const location of ['Plano, TX', 'Frisco, TX']) {
    const nearby = screen(mail('Angular Developer', `Location: ${location}`));
    assert.equal(nearby.fit, 'Review');
    assert.ok(nearby.reasons.some(reason => /conditional option/.test(reason.text)));
  }
});

test('hybrid and delayed remote arrangements are not fully remote fits', () => {
  for (const condition of ['Hybrid, remote three days', 'On-site two days', 'In office every Tuesday', 'Remote after onboarding']) {
    const result = screen(mail('Angular Developer', `Location: Remote\n${condition}`));
    assert.equal(result.fit, 'Review', condition);
    assert.ok(result.reasons.some(reason => /office attendance or hybrid/.test(reason.text)));
  }
  assert.equal(screen(mail('Angular Developer', 'Location: Remote\nNo onsite work required')).fit, 'Strong fit');
});

test('flagged clients remain reviewable regardless of location', () => {
  for (const client of ['AT&T', 'AT and T', 'Chase', 'JPMorgan Chase', 'JP Morgan', 'J.P. Morgan', 'JPMC', 'Bank of America', 'BofA', 'BOA']) {
    for (const location of ['Remote', 'Dallas, TX', 'Plano, TX']) {
      const result = screen(mail('Angular + Node.js Developer', `Client: ${client}\nLocation: ${location}`));
      assert.equal(result.fit, 'Review', `${client} / ${location}`);
      assert.ok(result.reasons.some(reason => reason.kind === 'check' && /client you asked to flag/.test(reason.text)));
    }
  }
});

test('end client takes precedence over recruiting company', () => {
  const result = screen(mail('Angular Developer Remote', 'Company: Recruiting Agency\nEnd Client: Chase'));
  assert.equal(result.company, 'Chase');
  assert.equal(result.fit, 'Review');
});

test('incidental employer mentions need verification rather than asserting the client', () => {
  const result = screen(mail('Angular Developer Remote', 'Client: Example Retail\nPrevious Bank of America experience preferred'));
  assert.equal(result.fit, 'Review');
  assert.ok(result.reasons.some(reason => reason.kind === 'check' && /verify whether it is the hiring client/.test(reason.text)));
  assert.ok(!result.reasons.some(reason => /stated client you asked to flag/.test(reason.text)));
});

test('unnamed Plano banking clients get an explicit client warning', () => {
  const result = screen(mail('Angular Developer', 'Location: Plano, TX\nClient: Major banking firm'));
  assert.equal(result.fit, 'Review');
  assert.ok(result.reasons.some(reason => /Banking in Plano needs extra scrutiny/.test(reason.text)));
  const remote = screen(mail('Angular Developer Remote', 'Client: Example Bank'));
  assert.equal(remote.fit, 'Strong fit');
});

test('recruiter signatures and generic nodes do not become client or stack matches', () => {
  const result = screen(mail('Angular Developer Remote', 'Build graph nodes\nThanks\nRecruiter at Chase'));
  assert.equal(result.fit, 'Strong fit');
  assert.ok(!result.reasons.some(reason => /Chase|Node.js matches/.test(reason.text)));
});
test('nearby cities, unknown locations, and remote restrictions need review', () => {
  for (const location of [
    'Plano, TX',
    'Irving, TX',
    'Remote (must live in CST time zone)',
    'TBD',
  ]) {
    assert.equal(screen(mail('Angular Developer', `Location: ${location}`)).fit, 'Review');
  }
  assert.equal(screen(mail('Angular Developer', 'Angular experience required')).fit, 'Review');
});
test('non-Dallas and geographically restricted remote roles fail the location rule', () => {
  for (const location of [
    'Durham, North Carolina (Locals Only)',
    'New York (no remote)',
    'Remote (UK only)',
  ]) {
    assert.equal(screen(mail('Angular Developer', `Location: ${location}`)).fit, 'Mismatch');
  }
});
test('incomplete worker bodies are never strong fits', () => {
  assert.equal(
    screen(mail('Angular Developer Remote', 'Angular and TypeScript', { truncated: true })).fit,
    'Review',
  );
});
test('multiple profiles in one email are reviewed instead of conflating their requirements', () => {
  const result = screen(
    mail(
      'Angular Developer Remote',
      'Profile:- Angular Developer\nRequired: Angular\nProfile:- Java Backend Developer\nStrong Java experience',
    ),
  );
  assert.equal(result.fit, 'Review');
  assert.match(result.reasons[0].text, /multiple roles/);
});
test('HTML mail is text only and salary values retain their period', () => {
  const result = screen(
    mail(
      'Angular Developer',
      '<p>Location: Remote</p><p>Salary: $119,662 - $179,493 a year</p><img src="https://example.com/track"><script>alert(1)</script>',
      { isHtml: true },
    ),
  );
  assert.deepEqual(result.pay, { min: 119662, max: 179493, period: 'year' });
  assert.doesNotMatch(result.body, /alert|track|<img/);
  assert.deepEqual(screen(mail('Angular Developer Remote', 'Rate: $60 - 65/hr')).pay, {
    min: 60,
    max: 65,
    period: 'hour',
  });
});
test('job-alert summaries require the actual requirements', () => {
  assert.equal(
    screen(
      mail('Frontend Engineer @ Example', 'Your Angular experience matches.\nRemote', {
        from: 'donotreply@match.indeed.com',
      }),
    ).fit,
    'Review',
  );
});
test('obvious social updates and deployment notifications are not opportunities', () => {
  assert.equal(isOpportunity(mail('Your posts got 5 impressions', 'Angular developer')), false);
  assert.equal(isOpportunity(mail('1 new project available to import', 'Angular')), false);
  assert.equal(isOpportunity(mail('Hiring Angular Developer', 'Remote')), true);
});
test('field labels never consume prose, plurals or role-overview headings', () => {
  const result = screen(
    mail(
      'Angular Developer Remote',
      'Roles & Responsibilities\nBuild Angular apps\nClient is a large firm\nPosition type: Contract',
    ),
  );
  assert.equal(result.title, 'Angular Developer Remote');
  assert.equal(result.company, 'Not stated');
});
test('a separate unlabelled Java profile does not disqualify the Angular profile', () => {
  assert.equal(
    screen(
      mail(
        'Angular Developer Remote',
        'Profile:- Angular Developer\nRequired: Angular\n\nJava Backend Developer\nRequired: Java',
      ),
    ).fit,
    'Review',
  );
});
test('remote travel needs review but a .NET role mentioning Angular is a mismatch', () => {
  assert.equal(
    screen(
      mail('Angular Developer', 'Location: Remote - Travel to client offices for week 1 onsite'),
    ).fit,
    'Review',
  );
  assert.equal(screen(mail('.Net Developer Remote', 'Angular UI and .NET backend')).fit, 'Mismatch');
});

test('display keeps the whole body while screening ignores recruiter signature and links', () => {
  const body = 'Location: Remote\nRequired: Angular\nThanks\nJava Developer recruiter\nNew Jersey\nApply: https://example.com/job\nRate: $65/hr';
  const result = screen(mail('Angular Developer Remote', body));
  assert.equal(result.fit, 'Strong fit');
  assert.equal(result.body, body);
});
test('HTML display retains links and text after signatures without running active content', () => {
  const result = screen(mail('Angular Developer Remote', '<p>Required: Angular</p><p>Thanks</p><p>Recruiter signature</p><a href="https://example.com/apply">Apply</a><script>alert(1)</script><img src="https://example.com/tracker">', { isHtml: true }));
  assert.match(result.body, /Recruiter signature/);
  assert.match(result.body, /https:\/\/example.com\/apply/);
  assert.doesNotMatch(result.body, /alert|tracker|<script/);
});

test('Microsoft development stacks are mismatches even alongside Angular', () => {
  for (const stack of ['.NET', '.Net Core', 'ASP.NET', 'ASP', 'C#', 'C sharp', 'CSharp', 'dotnet', 'dot net']) {
    const result = screen(mail('Angular Developer Remote', `Required skills: Angular, ${stack}`));
    assert.equal(result.fit, 'Mismatch', stack);
    assert.ok(result.reasons.some(reason => reason.kind === 'fail' && /target stack/.test(reason.text)));
  }
  assert.equal(screen(mail('Senior .NET Developer Remote', 'Build Angular UI')).fit, 'Mismatch');
});
test('optional Microsoft skills and consuming existing APIs stay reviewable', () => {
  for (const body of ['Required: Angular\nC# is optional', '.NET experience is preferred', 'No C# development required', 'Consume ASP.NET APIs from Angular', 'Integrate with existing .NET services']) {
    assert.equal(screen(mail('Angular Developer Remote', body)).fit, 'Review', body);
  }
});
test('Microsoft tooling, C++ and recruiter contact domains are not .NET requirements', () => {
  for (const body of ['Required: Angular, Azure DevOps, VS Code, Microsoft Teams', 'Required: Angular and C++', 'Angular development\nContact: recruiter@example.net']) {
    assert.equal(screen(mail('Angular Developer Remote', body)).fit, 'Strong fit', body);
  }
});
test('multiple Angular and Microsoft roles stay reviewable rather than rejecting both', () => {
  const result = screen(mail('Angular Developer Remote', 'Profile: Angular Developer\nRequired: Angular\nProfile: ASP.NET Developer\nRequired: C#'));
  assert.equal(result.fit, 'Review');
  assert.ok(result.reasons.some(reason => /listed roles calls for/.test(reason.text)));
});

test('explicit employee roles are full-time while contract terms take precedence', () => {
  for (const title of ['Angular Developer - Full Time', 'Angular Developer - Permanent Role', 'Direct Hire Angular Developer']) {
    assert.equal(screen(mail(title, 'Location: Dallas, TX')).employmentType, 'Full-time');
  }
  assert.equal(screen(mail('Angular Developer', 'Employment Type: Full-time\nLocation: Remote')).employmentType, 'Full-time');
  for (const terms of ['Full-time contract', 'W2 contract', 'Hourly: 70', 'Contractor', '1099', 'Freelance', 'Temporary']) {
    assert.equal(screen(mail('Full-time Angular Developer', terms)).employmentType, 'Contract');
  }
  assert.equal(screen(mail('Angular Developer', 'Duration: 12 months contract TO HIRE')).employmentType, 'Contract-to-hire');
});
test('ambiguous or incomplete employment terms do not become blue full-time roles', () => {
  for (const body of ['W2 only', 'Salary: 150000', 'Must be available full time', 'Previous permanent role experience preferred', 'Not a full-time position']) {
    const result = screen(mail('Angular Developer', body));
    assert.equal(result.employmentType, 'Unknown', body);
  }
  assert.equal(screen(mail('Full-time Angular Developer', 'Location: Remote', {truncated:true})).employmentType, 'Unknown');
});
test('tracked phrases match whole words across whitespace, never inside JavaScript', () => {
  const base = { subject: 'Angular Developer Remote', from: 'r@example.com', body: 'Fully remote Angular role.', isHtml: false };
  assert.equal(screen({ ...base, body: 'Team of JavaScript Engineers' }, ['Java Engineer']).reasons.some((r) => r.kind === 'fail' && r.text.includes('Tracked')), false);
  const hit = screen({ ...base, body: 'Pairs with a java\nengineer daily.' }, ['Java Engineer']);
  assert.equal(hit.fit, 'Mismatch');
  assert.equal(hit.reasons[0].evidence, 'Pairs with a java engineer daily.');
});
test('a negative tracked phrase forces Mismatch even in a multi-role email; a positive one does not', () => {
  const body = 'Profile:- Angular Developer\nRequired: Angular\nProfile:- Backend Java Engineer\nStrong Java experience';
  assert.equal(screen(mail('Angular Developer Remote', body), ['Backend Java Engineer']).fit, 'Mismatch');
  assert.equal(screen(mail('Angular Developer Remote', body), [{ phrase: 'Angular Developer', kind: 'positive' }]).fit, 'Review');
});
