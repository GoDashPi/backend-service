'use strict';

const AWS = require('aws-sdk');
const spawn = require('child_process').spawn;
const fs = require('fs-extra');
const BbPromise = require('bluebird');
const path = require('path');
const moment = require('moment');

const { spawnPromise, pad } = require('../shared');

const writeFile = BbPromise.promisify(fs.writeFile);
const ensureDir = BbPromise.promisify(fs.ensureDir);
const remove = BbPromise.promisify(fs.remove);

let ffmpeg; // todo: better implementation

const config = {
  region: AWS.config.region || process.env.SERVERLESS_REGION || 'eu-west-1',
};

const s3 = new AWS.S3(config);

const fetchFrames = (session, directory) => {
  return ensureDir(directory)
    .then(() =>s3.listObjects({
      Bucket: process.env.UPLOAD_BUCKET_NAME,
      Prefix: `${session}/frames`,
    }).promise())
    .then(({ Contents }) => Contents.map(({ Key }) => Key))
    .then(frames =>
      Promise.all(frames.map(frame => s3.getObject({
        Bucket: process.env.UPLOAD_BUCKET_NAME,
        Key: frame,
      }).promise().then((data) => Object.assign({ Key: frame }, data)))))
    .then(frames => {
      frames.sort((a, b) => {
        const aBase = parseInt(path.parse(a.Key).base);
        const bBase = parseInt(path.parse(b.Key).base);
        return aBase - bBase;
      });
      return Promise.all(frames.map((frame, index) => {
        console.log(index, frame);
        const { base } = path.parse(frame.Key);
        const filename = path.join(directory, `${pad(index, 5)}.png`);
        return writeFile(filename, frame.Body);
      }))
    });
};

const createGifPreview = (directory, session) =>
  spawnPromise(spawn(ffmpeg, (`-i ${path.join(directory, session, '%05d.png')} -vf setpts=4*PTS ${path.join(directory, `preview-${session}.gif`)}`).split(' ')));

module.exports.handler = (event, context, callback) => {
  ffmpeg = process.env.FFMPEG || './ffmpeg/ffmpeg'; // defaults to included ffmpeg binary

  const session = event.session;
  const directory = path.join('/', 'tmp', 'chunks', 'previews');

  return fetchFrames(session, path.join(directory, session))
    .then(() => createGifPreview(directory, session))
    .then(() => remove(path.join(directory, session)))
    .then(() => s3.putObject({
      Bucket: process.env.UPLOAD_BUCKET_NAME,
      Key: `preview-${session}.gif`,
      ContentType: 'image/gif',
      Body: fs.readFileSync(path.join(directory, `preview-${session}.gif`))
    }).promise())
    .then(data => callback(null, data))
    .catch(callback);
};
