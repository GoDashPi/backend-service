'use strict';

const mod = require('../register-chunk/index.js');
const mochaPlugin = require('serverless-mocha-plugin');

const lambdaWrapper = mochaPlugin.lambdaWrapper;
const expect = mochaPlugin.chai.expect;
const wrapped = lambdaWrapper.wrap(mod, { handler: 'handler' });

describe('get-upload-url', () => {
  before((done) => {
//  lambdaWrapper.init(liveFunction); // Run the deployed lambda
    done();
  });

  it('implement tests here', () =>
    wrapped.run({
      pathParameters: {
        key: encodeURIComponent('folder/file.mp4'),
      },
    }).then((response) => {
      const body = JSON.parse(response.body);
      expect(body.url).to.contain('https://s3.amazonaws.com/%5Bobject%20Object%5D/folder/file.mp4?AWSAccessKeyId=');
      expect(body.filename).to.be.equal('folder/file.mp4');
    }));
});
