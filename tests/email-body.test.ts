import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEmailBody } from '../src/app/email-body.ts';

test('rejoins the position, location and duration from the screenshot',()=>{
 assert.deepEqual(formatEmailBody('Hi Ernie,\n\nPOSITION\n\nUI/Angular developer\n\nLOCATION\n\nRemote\n\nDURATION\n\n12 months contract TO HIRE'),[
 {kind:'text',text:'Hi Ernie,'},
 {kind:'field',label:'Position',value:'UI/Angular developer'},
 {kind:'field',label:'Location',value:'Remote'},
 {kind:'field',label:'Duration',value:'12 months contract TO HIRE'},
 ]);
});
test('already inline fields, URLs, money, and requirements are retained',()=>{
 const blocks=formatEmailBody('Location: Dallas, TX\nRate: $60/hr\n\nRequired Skills\nAngular\nNode.js\n\nApply: https://example.test/role');
 assert.equal(blocks[0].kind,'field');
 assert.deepEqual(blocks[1],{kind:'field',label:'Rate',value:'$60/hr'});
 assert.equal(blocks[2].kind,'text');
 assert.match(blocks[2].text,/Required Skills\nAngular\nNode.js/);
 assert.match(blocks[2].text,/https:\/\/example.test\/role/);
});
test('missing values do not consume the next field or a section heading',()=>{
 for(const body of ['LOCATION\n\nDURATION\n\n12 months','LOCATION\n\nJob Description\nAngular']) {
   const blocks=formatEmailBody(body);
   assert.equal(blocks[0].kind,'text');
   assert.match(blocks[0].text,/LOCATION/);
 }
});
test('CRLF metadata and long values are not truncated',()=>{
 const value='Dallas or remote with client visits in '+ 'a nearby city '.repeat(30);
 const result=formatEmailBody('LOCATION:\r\n\r\n'+value);
 assert.equal(result.length,1);
 assert.equal(result[0].kind,'field');
 if(result[0].kind==='field')assert.equal(result[0].value,value.trim());
 assert.deepEqual(formatEmailBody(''),[]);
});

test('uppercase values are field values rather than section headings',()=>{
 assert.deepEqual(formatEmailBody('LOCATION\nREMOTE\nCOMPANY\nIBM'),[{kind:'field',label:'Location',value:'REMOTE'},{kind:'field',label:'Company',value:'IBM'}]);
});
